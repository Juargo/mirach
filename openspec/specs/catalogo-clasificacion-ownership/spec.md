# Catalog Ownership Specification (apps/api — domain/application/infrastructure)

## Purpose

Defines the system design for catalog ownership (`Categoria` + `PatronClasificacion`):
a per-user owned row set, created by copying a fixed template at account-creation time.
Covers the schema invariant, the copy-on-creation hook (bootstrap user + demo users),
the guarded backfill of existing rows, `userId`-scoped categorization and
reclassification, the RNF-SEC-006 isolation guarantee, the read-path fold
mechanism, and demo cleanup. This spec addresses **ownership only** — catalog CRUD
(create, rename, delete a categoría/pattern) is deferred to future work.

## Requirements

### Requirement: CAT037-01 — Every catalog row is owned by exactly one user

`Categoria` and `PatronClasificacion` MUST both carry a NOT NULL `userId`.
`Categoria` MUST be unique per `(userId, nombre)` — the previous global
`nombre` unique constraint MUST NOT exist. Existing
production rows MUST be owned by the pre-existing bootstrap user, with no
`Transaccion.categoriaId` or `PatronClasificacion.categoriaId` foreign key
repointed by the migration.

#### Scenario: Categoria requires a userId

- GIVEN the schema with the catalog-ownership migration applied
- WHEN a `Categoria` row is created without a `userId`
- THEN the database rejects the insert

#### Scenario: Two users can each own a categoría with the same nombre

- GIVEN user A and user B each have their own catalog copy
- WHEN both catalogs contain a categoría named "Supermercado"
- THEN both rows persist without a unique-constraint violation, each scoped
  to its own `userId`

#### Scenario: Backfill preserves existing transaction links

- GIVEN the pre-migration database with one real (non-demo) user and their
  existing `Transaccion` rows pointing at global `Categoria` ids
- WHEN the backfill migration runs
- THEN every existing `Categoria` and `PatronClasificacion` row is owned by
  that user's `userId`, AND no `Transaccion.categoriaId` value changes

#### Scenario: Backfill refuses to run when more than one real user exists

- GIVEN a database containing more than one non-demo `User`
- WHEN the backfill migration runs
- THEN it MUST raise an error and MUST NOT assign ownership of any catalog
  row

### Requirement: CAT037-02 — A new user gets their own full catalog copy at creation time

Every newly created user — including every demo user — MUST have exactly 8
own `Categoria` rows and the full template `PatronClasificacion` set,
created atomically with the user (same transaction as the user-creation
call site). Re-running the bootstrap seed MUST be idempotent: it MUST NOT
duplicate rows and MUST NOT move the bootstrap user's existing row ids.

Product constraint: a demo user's catalog copy is
**read-only**. Demo users MUST NOT be able to modify their categories or
patterns; any catalog mutation endpoint MUST reject demo sessions
with guidance to register an account. This constraint is a binding precondition
for future catalog-modification work.

#### Scenario: A fresh demo user starts with a full private catalog

- GIVEN a new demo user is created via the demo entry point
- WHEN the demo creation transaction completes
- THEN the demo user owns exactly 8 `Categoria` rows and the full set of
  template patterns, all scoped to that user's `userId`

#### Scenario: Demo user creation is all-or-nothing

- GIVEN the catalog copy step fails partway during demo user creation
- WHEN the enclosing transaction is evaluated
- THEN neither the demo `User` nor any partial catalog row is persisted
  (no orphaned demo user, no orphaned catalog rows)

#### Scenario: Re-running the bootstrap seed does not duplicate or move rows

- GIVEN the bootstrap user's catalog has already been seeded
- WHEN the seed runs again
- THEN the categoría/pattern count for that user is unchanged and no
  existing row's id changes

### Requirement: CAT037-03 — Categorization uses only the ingesta owner's own patterns

`ProcessIngestaUseCase.runCategorizacion` MUST classify an ingesta's
transactions using only `PatronClasificacion` rows owned by the ingesta's
`userId`. The existing degradable-island behaviour on catalog lookup
failure MUST be unchanged: on failure, only `Ingreso` rows are written,
every other row is left `null` (never a placeholder category), and the
failure MUST be retry-safe.

Classification MUST be deterministic and user-independent: with per-user
copied rows, pattern ids become generated surrogates, so the tie-break
order MUST be `(prioridad, patron, id)` — never `(prioridad, id)` alone.
Two users with identical catalogs MUST resolve an equal-priority collision
to the same categoría.

#### Scenario: Equal-priority collisions resolve identically for every user

- GIVEN user A and user B have identical catalog copies (per-user generated
  ids) containing two equal-`prioridad` patterns that both match one
  description
- WHEN each user's matching transaction is classified
- THEN both users' transactions resolve to the same categoría, decided by
  the pattern text order, regardless of physical row ids or copy order

#### Scenario: Categorization matches only against the owner's patterns

- GIVEN user A and user B each have a pattern matching the description
  "netflix" mapped to a different categoría
- WHEN an ingesta belonging to user A is processed
- THEN the resulting transaction is classified using user A's pattern, never
  user B's

#### Scenario: Catalog lookup failure preserves the degradable island

- GIVEN the catalog lookup for the ingesta owner's patterns fails
- WHEN categorization runs
- THEN Ingreso rows (by the `abono>0 && cargo===0` rule) are still written,
  and every other row's `categoriaId` is left `null` for a safe retry

### Requirement: CAT037-04 — Reclassification resolves and persists the caller's own categoría, unconstrained by any closed name set

The reclassify write path MUST resolve the target `Categoria` by the
caller's own `(userId, nombre)` pair and MUST persist and return that row's
real, per-user id. No runtime path in the reclassify flow MUST resolve a
`categoriaId` through a static global id map or reject a nombre solely for
not belonging to a closed/enumerated set — ownership of the row is the only
validity test. A nombre absent from the caller's own catalog MUST return
`400` with a generic "category not found in your catalog" message, never an
enumerated list of valid names.

#### Scenario: Reclassify persists the caller's own categoría row

- GIVEN user A reclassifies one of their own transactions to categoría
  "Transporte"
- WHEN the write completes
- THEN the transaction's `categoriaId` equals user A's own "Transporte" row
  id, and the response DTO reflects that same real id

#### Scenario: Two users reclassifying to the same nombre get different ids

- GIVEN user A and user B each reclassify a transaction to their own
  categoría named "Ahorro"
- WHEN both writes complete
- THEN the two persisted `categoriaId` values differ, each pointing to the
  respective user's own row

#### Scenario: Reclassify to a user-created custom category succeeds

- GIVEN user A has created a custom category "Mascotas" not in the original template
- WHEN they reclassify a transaction with `{ categoria: "Mascotas" }`
- THEN the response is `200` and the transaction's `categoriaId` is that custom category's own id

#### Scenario: Reclassify to a nombre outside the caller's catalog is a generic 400

- GIVEN a nombre that does not exist in the caller's own catalog
- WHEN they call reclassify with that nombre
- THEN the response is `400` with a generic "not found in your catalog" message, not an enumerated list

### Requirement: CAT037-05 — Every catalog query is isolated by userId (RNF-SEC-006)

Every read or write of `Categoria` or `PatronClasificacion` MUST filter by
`userId` in the SQL `WHERE` clause (structural isolation), never by an
in-memory filter applied after an unscoped query. A user MUST NOT be able
to read, match against, or write another user's catalog rows through any
code path.

#### Scenario: User A cannot read user B's categories

- GIVEN two seeded users A and B, each with their own catalog copy
- WHEN a client authenticated as A requests data that includes categoría
  information (dashboard, movimientos, detalle-bucket)
- THEN only A's own `Categoria` rows ever appear in the response

#### Scenario: User A's ingesta never matches against user B's patterns

- GIVEN two seeded users A and B with different patterns for the same
  description text
- WHEN user A's ingesta is categorized
- THEN the classification result never reflects a match from user B's
  pattern set

#### Scenario: User A cannot reclassify using user B's categoría id

- GIVEN user B's real `Categoria` row id
- WHEN user A's session calls the reclassify endpoint with that id
- THEN the request is rejected and no transaction is mutated using a
  cross-tenant categoría reference

#### Scenario: The legacy backfill script cannot write across tenants

- GIVEN the one-off backfill script and a database
  with more than one user
- WHEN the script runs
- THEN it only touches transactions belonging to the bootstrap user
  (explicit `userId` scope in its query) and never stamps bootstrap
  category ids onto another user's transactions

### Requirement: CAT037-06 — Read paths resolve categoría by nombre; ownership is the sole authority, not name membership

Every read repository that folds a raw `categoriaId` back to a domain
category MUST resolve the fold by the stored row's `nombre`, sourced from a
`userId`-scoped query. No runtime read path MUST reject or null out a
category solely because its `nombre` falls outside the original 8-value
template — a row returned by an ownership-scoped query is valid by
construction. The legacy global id/name map MAY still seed the template only.

#### Scenario: A non-seed user's categorized transactions still show their category

- GIVEN a demo user with a transaction classified into their own "Streaming" categoría
- WHEN that user requests movimientos or detalle-bucket for the period
- THEN the response's `categoria` field for that row is `{ nombre: "Streaming", ... }`

#### Scenario: A second user sees categories on the dashboard

- GIVEN a second non-demo user with categorized transactions in the current period
- WHEN that user requests `/api/resumen` and the bucket detail views
- THEN categorized transactions show their real categoría

#### Scenario: A user-created category name is never folded to null

- GIVEN a user has renamed or created a category with a name absent from the original 8-value template (e.g. "Mascotas")
- WHEN transactions classified into it are read via dashboard, movimientos, or detalle-bucket
- THEN they show `{ nombre: "Mascotas", ... }`, never a `null` category

### Requirement: CAT037-07 — Demo cleanup removes catalog rows without FK violations or orphans

`DemoCleanupService.borrarExpirados()` MUST delete an expiring demo user's
`PatronClasificacion` rows before their `Categoria` rows, and both before
the `User` row, respecting the existing ordering constraint that
`Transaccion` deletion precedes `Categoria` deletion. After cleanup
completes for an expired demo user, zero orphaned `Categoria` or
`PatronClasificacion` rows for that user MUST remain, and the deletion
chain MUST NOT raise a foreign-key violation.

#### Scenario: Expiring a demo user leaves no orphan catalog rows

- GIVEN an expired demo user with their own catalog copy and categorized
  transactions
- WHEN `borrarExpirados()` processes that user
- THEN no `Categoria` or `PatronClasificacion` row referencing that user's
  `userId` remains afterward, and no foreign-key error is raised

### Requirement: CAT038-01 — Category creation requires nombre and an assignable bucket

`POST /api/categorias` MUST require `nombre` (trimmed, 1–40 chars) and `bucket`.
`bucket` MUST be one of `Necesidades`/`Deseos`/`Ahorro`; `Ingreso` and
`SinCategoria` are computed states and MUST NOT be assignable. `nombre`
uniqueness per user MUST be case-insensitive.

#### Scenario: Valid category is created

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }`
- THEN the response is `201` with the new category's real id

#### Scenario: Missing or non-assignable bucket is rejected

- GIVEN an authenticated user
- WHEN they POST with `bucket` omitted, or `bucket: "Ingreso"` / `"SinCategoria"`
- THEN the response is `400`

#### Scenario: Case-insensitive duplicate name is rejected

- GIVEN a user already owns a category named "Mascotas"
- WHEN they POST `{ nombre: "mascotas", bucket: "Deseos" }`
- THEN the response is `409`

### Requirement: CAT038-02 — GET /api/categorias returns the caller's catalog with nested patterns

`GET /api/categorias` MUST return only the caller's own `Categoria` rows,
each with its `patrones` nested. A category with zero patterns MUST be
returned with `patrones: []`.

#### Scenario: Zero-pattern category is valid and visible

- GIVEN a user owns a category with no patterns attached
- WHEN they GET `/api/categorias`
- THEN that category appears with `patrones: []`

#### Scenario: Response never includes another user's rows

- GIVEN user A and user B each own categories
- WHEN user A calls GET `/api/categorias`
- THEN only user A's rows appear

### Requirement: CAT038-03 — Category update supports rename and re-bucket, re-stamping history atomically

`PATCH /api/categorias/:id` MUST reject a rename that collides
case-insensitively with another of the caller's categories (`409`). When the
`bucket` actually changes, the update MUST, in the same DB transaction,
re-stamp `bucketId` on every `Transaccion` currently pointing at that
category, for any period.

#### Scenario: Re-bucket updates historical transactions atomically

- GIVEN a category "Delivery" with `bucket: Deseos` and past transactions
- WHEN the caller PATCHes `bucket: "Necesidades"`
- THEN the response is `200`, and `/api/resumen` and the bucket drill-down
  report those transactions under `Necesidades` immediately after

#### Scenario: Rename collides with an existing name

- GIVEN the caller owns "Ahorro" and "Inversiones"
- WHEN they PATCH "Inversiones" to `nombre: "ahorro"`
- THEN the response is `409`

#### Scenario: Updating another user's category is a 404, not a 403

- GIVEN user B's category id
- WHEN user A PATCHes that id
- THEN the response is `404`

### Requirement: CAT039-01 — Category listing reports the caller's per-category transaction count

`GET /api/categorias` MUST include a `transaccionesCount` field per
category, counting only the caller's own `Transaccion` rows that reference
that category, across all periods (all-history, never scoped to the
current month). The count MUST be produced by a `userId`-scoped query (SQL
`WHERE`), never by an in-memory filter over an unscoped result set. A
category with zero referencing transactions — including a category created
one moment earlier — MUST report `transaccionesCount: 0`.

This count is the only impact-preview mechanism for a destructive delete
(CAT038-04): there is no dedicated impact endpoint and no server-side
confirm step. A client warns the user using the number it already fetched
in the listing.

#### Scenario: transaccionesCount reflects all-history transactions

- GIVEN a user's category is referenced by 12 transactions spread across 3
  different periods
- WHEN the caller GETs `/api/categorias`
- THEN that category's `transaccionesCount` is 12

#### Scenario: transaccionesCount never counts another user's transactions

- GIVEN user A and user B each own a category with the same nombre, and
  each has transactions referencing their own category
- WHEN user A GETs `/api/categorias`
- THEN user A's category shows only user A's own transaction count, and
  never reflects user B's transactions

#### Scenario: A brand-new category reports zero

- GIVEN a category just created via `POST /api/categorias`
- WHEN the caller GETs `/api/categorias`
- THEN that category's `transaccionesCount` is 0

### Requirement: CAT038-04 — Category deletion always succeeds, preserving transactions and their bucket

`DELETE /api/categorias/:id` MUST delete the category together with its
patterns, in one DB transaction, and MUST return `204` regardless of
whether any `Transaccion` (any period) references the category. This
endpoint MUST NOT have a `409` response, and no in-use rejection error
MUST exist for it.

Every `Transaccion` that referenced the deleted category MUST survive the
delete unchanged except for its category label: it MUST NOT be deleted and
MUST NOT be reassigned to a different category. Its `categoriaId` MUST
become `null`; its `bucketId` MUST remain exactly what it was before the
delete.

Because bucket classification is the only input to the 50/30/20 summary
and the semáforo, and the delete never touches `bucketId`, deleting a
category MUST NOT change `/api/resumen`, its bucket subtotals, its
percentages, or the semáforo for any period — before and after the delete,
those values MUST be identical.

The category's patterns MUST be deleted as part of the same DB transaction
as the category; a failure partway through MUST leave the category, its
patterns, and every referencing transaction exactly as they were
(atomicity is unconditional, not only for the previously-unused case).

The endpoint's generated OpenAPI operation MUST NOT declare a `409`
response and its description MUST NOT mention a rejection for in-use
categories; `openapi.json` and `@moneydiary/api-client` regeneration MUST
pass their existing CI drift gates (CAT038-09).

Deleting a category is irreversible: the category row and its patterns are
gone, and the affected transactions permanently lose their category label.
The pre-delete impact count (CAT039-01) is the safeguard.

#### Scenario: Deleting an in-use category succeeds and detaches its transactions

- GIVEN a category referenced by transactions across multiple periods,
  each transaction carrying a `bucketId`
- WHEN the caller DELETEs it
- THEN the response is `204`; the category and its patterns are gone;
  every previously-referencing transaction still exists, with
  `categoriaId: null` and its original `bucketId` unchanged

#### Scenario: Deleting an unused category still cascades its patterns

- GIVEN a category with 3 patterns and zero transactions
- WHEN the caller DELETEs it
- THEN the response is `204` and both the category and its 3 patterns are
  gone

#### Scenario: Deleting a category never moves money between buckets

- GIVEN a user's `/api/resumen` payload for a period — bucket subtotals,
  percentages and semáforo state — captured before deleting one of their
  in-use categories
- WHEN that category is deleted and `/api/resumen` is requested again for
  the same period
- THEN the two payloads are identical: no transaction's `bucketId` changed,
  so no amount moved between Necesidades/Deseos/Ahorro and the semáforo
  state is unchanged

> Note: issue #273's original wording for this criterion ("the month
> summary reflects the change") is superseded by production evidence — 85%
> of live transaction rows already have `categoriaId IS NULL` with a real
> `bucketId` and already count toward the budget, so that wording would be
> satisfied vacuously (nothing visibly "reflects" a label loss in money
> terms). This requirement instead asserts the opposite and falsifiable
> claim: deleting a category changes no money total anywhere.

#### Scenario: A failed delete leaves category, patterns and transactions untouched

- GIVEN a category with patterns and in-use transactions
- WHEN the delete transaction fails partway (e.g. a constraint violation)
- THEN the category, all of its patterns, and every referencing
  transaction remain exactly as they were before the attempt — none is
  partially deleted or partially detached

#### Scenario: Deleting another user's category id is a 404, and their data is untouched

- GIVEN user B's real category id, itself referenced by user B's own
  transactions
- WHEN user A DELETEs that id
- THEN the response is `404`; user B's category, its patterns and its
  transactions are all unaffected

#### Scenario: A demo session cannot delete a category

- GIVEN a demo session
- WHEN it calls DELETE on any of its own category ids
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`, and nothing
  is deleted (regression guard for CAT038-08, unchanged by this change)

### Requirement: CAT038-05 — Pattern CRUD supports the three match types with per-user uniqueness and priority

`POST`/`PATCH /api/patrones` MUST require `matchType` in
`CONTAINS`/`STARTS_WITH`/`REGEX` and a `patron` (trimmed, 1–200 chars)
referencing one of the caller's own categories. `patron` text MUST be unique
per user, case-insensitively (`409`). `prioridad` is optional, integer
`1..999`, defaulting to `100`.

#### Scenario: Invalid matchType is rejected

- GIVEN an authenticated user
- WHEN they POST a pattern with `matchType: "FUZZY"`
- THEN the response is `400`

#### Scenario: Pattern targeting a foreign or missing category is rejected

- GIVEN a category id the caller does not own
- WHEN they POST a pattern with that `categoriaId`
- THEN the response is `404`

#### Scenario: Duplicate pattern text is rejected case-insensitively

- GIVEN the caller already owns a pattern with text "netflix"
- WHEN they POST `patron: "Netflix"` (any matchType)
- THEN the response is `409`

#### Scenario: prioridad defaults and is bounded

- GIVEN a new pattern with `prioridad` omitted
- WHEN it is created
- THEN it is stored with `prioridad: 100`; a request with `prioridad: 1000` returns `400`

### Requirement: CAT038-06 — Invalid REGEX is rejected at write time; malformed stored patterns never break matching

Creating or updating a `REGEX` pattern MUST attempt `new RegExp(patron)` and
return `400` if it throws. This write-time check MUST NOT alter the
existing runtime guarantee that `coincide()` degrades any malformed stored
pattern to no-match inside a `try/catch`, never throwing during
categorization.

#### Scenario: Invalid REGEX is rejected on write

- GIVEN a `REGEX` pattern payload with an unbalanced `(`
- WHEN the caller creates or updates it
- THEN the response is `400`

#### Scenario: A pre-existing malformed REGEX still degrades safely

- GIVEN a stored `REGEX` pattern that predates this validation and does not compile
- WHEN categorization evaluates it against a transaction description
- THEN it is treated as no-match and categorization does not throw

### Requirement: CAT038-07 — Every catalog endpoint enforces ownership isolation with anti-enumeration 404

All 7 endpoints MUST require a valid session and `x-api-key`, and MUST
filter by `userId` in the SQL `WHERE` for every query and mutation. A
request targeting another user's category or pattern id MUST return `404`
("does not exist" and "is not yours" are indistinguishable).

#### Scenario: User B gets 404 reading, renaming, re-bucketing or deleting user A's rows

- GIVEN user A's real category or pattern id
- WHEN user B calls PATCH or DELETE on that id
- THEN the response is `404`, never `403`

### Requirement: CAT038-08 — Catalog mutations are read-only for demo sessions

Every catalog-mutation use case MUST require `esDemo` as an input and MUST
return `403` with `code: "DEMO_SOLO_LECTURA"` when the calling session is a
demo session. `GET /api/categorias` MUST remain available to demo sessions.

#### Scenario: Demo session cannot mutate the catalog

- GIVEN a demo session
- WHEN it calls any of the 6 write endpoints
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`

#### Scenario: Demo session can still read the catalog

- GIVEN a demo session
- WHEN it calls GET `/api/categorias`
- THEN the response is `200` with the demo user's own catalog

### Requirement: CAT038-09 — Generated API contracts stay in sync with the CRUD surface

`openapi.json` MUST document all 7 endpoints and pass `openapi:check`.
`@moneydiary/api-client`'s generated types MUST be regenerated and pass its
CI drift gate. Money fields on new/modified endpoints MUST remain
BigInt-safe strings.

#### Scenario: Contract generation stays green

- GIVEN the 7 endpoints and their Zod schemas are implemented
- WHEN `openapi:check` and the `api-client` CI job run
- THEN both pass with zero drift

### Requirement: CAT038-10 — Category creation accepts an optional nested patrones list, created atomically

`POST /api/categorias` MUST accept an optional `patrones` array of
`{ patron, matchType }` objects. When `patrones` is present and non-empty, the
categoría and every submitted patrón MUST be created in one database
transaction: if any patrón fails validation, or persistence of the categoría
or any patrón fails, none of them MUST be persisted (all-or-nothing). Each
created patrón's `prioridad` MUST default server-side to the same value
`POST /api/patrones` already defaults to (100) — the caller MUST NOT supply
`prioridad` for nested patrones.

When `patrones` is omitted or an empty array, the endpoint's request and
response contract, and persisted state, MUST be identical to the pre-existing
CAT038-01 contract — this is an additive, backward-compatible extension.
Existing clients that never send `patrones` (including mobile, ADR-038) MUST
see no behavior change.

The `201` response body MUST be the created categoría including its created
patrones nested (`CategoriaResponse.patrones`), the same shape
`GET /api/categorias` already returns per category (CAT038-02). When
`patrones` is empty or omitted, the response's `patrones` field MUST be `[]`,
unchanged from today.

#### Scenario: Categoría and patrones are created atomically

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos", patrones: [{ patron: "petco", matchType: "CONTAINS" }, { patron: "vet", matchType: "CONTAINS" }] }`
- THEN the response is `201` with the new categoría's id and both patrones nested, each with its own real id
- AND both patrones are persisted in the same transaction as the categoría

#### Scenario: A failing patrón rolls back the whole request

- GIVEN an authenticated non-demo user submits a categoría with 2 patrones, where the second has an invalid REGEX
- WHEN the request is processed
- THEN the response is `400`
- AND neither the categoría nor the first (otherwise valid) patrón is persisted

#### Scenario: Omitting patrones behaves exactly as before

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }` (no `patrones` field)
- THEN the response and persisted state are identical to the pre-existing CAT038-01 contract
- AND the response's `patrones` field is `[]`

#### Scenario: Empty patrones array behaves like omission

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos", patrones: [] }`
- THEN the response is `201` with `patrones: []` and no patrón row is created

#### Scenario: prioridad is not caller-supplied for nested patrones

- GIVEN a POST with a nested patrón that has no `prioridad` field
- WHEN the categoría is created
- THEN the persisted patrón's `prioridad` is `100`, the same default `POST /api/patrones` uses today

#### Scenario: A demo session cannot use the nested-patrones create path

- GIVEN a demo session
- WHEN it POSTs `{ nombre, bucket, patrones: [...] }`
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`
- AND nothing is persisted (regression guard for CAT038-08, unchanged by this change)

### Requirement: CAT038-11 — Nested patrón validation reuses existing domain rules and reports the failing entry by index

Each entry in the submitted `patrones` array MUST be validated with the exact
same domain rules `POST /api/patrones` already enforces: `patron` trimmed
1–200 chars (`PATRON_INVALIDO`), `matchType` in
`CONTAINS`/`STARTS_WITH`/`REGEX` (`MATCH_TYPE_INVALIDO`), and a compilable
`REGEX` when `matchType: "REGEX"` (`REGEX_INVALIDA`). All entries MUST be
validated before any write occurs (locked decision 4 — no partial catalog
state is reachable).

Two or more entries in the SAME submitted list whose `patron` text collides
case-insensitively MUST be rejected with `PATRON_DUPLICADO` (`409`),
identically to the existing cross-request duplicate check a caller's catalog
already enforces. A nested patrón colliding case-insensitively with a patrón
the caller already owns MUST also be rejected with `PATRON_DUPLICADO`.

Any per-patrón validation failure's error response MUST identify the failing
entry by its zero-based index in the submitted `patrones` array, so a client
can point the user at the specific offending row. The set of possible error
codes for this endpoint stays the pre-existing closed list
(`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `PATRON_INVALIDO`,
`MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`, `NOMBRE_DUPLICADO`,
`PATRON_DUPLICADO`, `DEMO_SOLO_LECTURA`) — this change introduces no new error
code.

#### Scenario: Invalid matchType in a nested patrón is rejected with its index

- GIVEN a POST with `patrones: [{ patron: "netflix", matchType: "CONTAINS" }, { patron: "spotify", matchType: "FUZZY" }]`
- WHEN the request is validated
- THEN the response is `400` with `code: "MATCH_TYPE_INVALIDO"` and identifies the failing entry at index 1
- AND nothing is persisted

#### Scenario: Duplicate patrón text within the same submitted list is rejected

- GIVEN a POST with `patrones: [{ patron: "netflix", matchType: "CONTAINS" }, { patron: "Netflix", matchType: "STARTS_WITH" }]`
- WHEN the request is validated
- THEN the response is `409` with `code: "PATRON_DUPLICADO"` and identifies the colliding entry
- AND nothing is persisted

#### Scenario: A nested patrón colliding with an existing catalog patrón is rejected

- GIVEN the caller already owns a patrón with text "netflix"
- WHEN they POST a categoría with a nested patrón `{ patron: "Netflix", matchType: "CONTAINS" }`
- THEN the response is `409` with `code: "PATRON_DUPLICADO"`
- AND neither the categoría nor any of its other valid nested patrones is persisted

#### Scenario: Invalid REGEX in a nested patrón is rejected before any write

- GIVEN a POST with a nested patrón `{ patron: "(unbalanced", matchType: "REGEX" }`
- WHEN the request is validated
- THEN the response is `400` with `code: "REGEX_INVALIDA"` and the failing entry's index
- AND no categoría or patrón row is persisted

#### Scenario: No new error code is introduced

- GIVEN the full set of validation failures reachable through the nested-patrones create path
- WHEN each failure is mapped to an HTTP response
- THEN every `code` value belongs to the pre-existing closed set already used by `POST /api/patrones` and `POST /api/categorias`

### Requirement: CAT038-12 — Generated API contract stays in sync with the extended create endpoint

`openapi.json` MUST document the optional `patrones` request field and the
resulting response shape on `POST /api/categorias`, and MUST pass
`openapi:check`. `@moneydiary/api-client`'s generated types MUST be
regenerated to reflect the extended request/response types and MUST pass its
CI drift gate.

#### Scenario: Contract generation stays green after the extension

- GIVEN the extended `POST /api/categorias` schema (optional nested `patrones`) is implemented
- WHEN `openapi:check` and the `api-client` CI drift job run
- THEN both pass with zero drift

## Non-Goals

- Mobile UI for catalog management — deferred to future work.
- Bulk reassignment of a deleted category's transactions to **another**
  category — a different product feature (a migration wizard), not a
  safety net for delete.
- Nulling `bucketId` along with `categoriaId` on delete — rejected with
  production evidence (CAT038-04): it would create two indistinguishable
  "Sin categoría" states that behave differently in the budget.
- A dedicated `GET /api/categorias/:id/impacto` endpoint — the count
  travels in the existing listing (CAT039-01) instead.
- A server-side `?confirm=true` / two-phase delete — trivially bypassable
  and guarantees nothing a client-side warning does not already provide.
- Restoring a deleted category or undoing the un-labelling of its
  transactions — the warning (CAT039-01) is the safeguard; recovery, if
  ever needed, is a database-level point-in-time restore, not a product
  feature.
- A composite `(categoriaId, userId)` FK on `Transaccion` (the structural
  guarantee `PatronClasificacion` already has) — deferred; no observed
  cross-tenant defect today.
- Importing/merging suggested categories into an existing user's catalog.
- Any new signup flow — the copy hook only lands in the two user-creation
  points that exist today.
- Per-user `BucketPresupuesto` — buckets stay a global fixed taxonomy of 5.
- Template versioning or propagating later template edits to existing
  users' already-copied rows.
- Demo-gating pre-existing mutations (`POST /api/ingestas`,
  `PATCH /api/transacciones/:id/categoria`). Demo users keep uploading and
  reclassifying — only the **catalog** is read-only.
