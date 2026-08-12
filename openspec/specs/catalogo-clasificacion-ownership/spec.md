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

### Requirement: CAT037-04 — Reclassification resolves and persists the caller's own categoría

The reclassify write path MUST resolve the target `Categoria` by the
caller's own `(userId, nombre)` pair and MUST persist and return that row's
real, per-user id. No runtime path in the reclassify flow MUST resolve a
`categoriaId` through a static global id map.

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

### Requirement: CAT037-06 — Read paths resolve categoría by nombre, not by the old global id map

Because per-user catalog rows use freshly generated ids that do not match
the legacy global id constant, every read repository that folds a raw
`categoriaId` back to the domain `Categoria` enum (movimientos, resumen,
detalle-bucket) MUST resolve the fold by the stored row's `nombre` — not by
looking the physical id up in a legacy global id map. After this change,
no runtime read path MUST depend on the legacy global id constant to
resolve a category name; it MAY still be used only for seed/template initialization.

#### Scenario: A non-seed user's categorized transactions still show their category

- GIVEN a demo user (a non-seed user) with a transaction classified into
  their own "Streaming" categoría
- WHEN that user requests movimientos or detalle-bucket for the period
- THEN the response's `categoria` field for that row is `{ nome:
  "Streaming", ... }`, not `null`

#### Scenario: A second user sees categories on the dashboard

- GIVEN a second (non-seed) user with categorized transactions in the
  current period
- WHEN that user requests `/api/resumen` and the bucket detail views
- THEN categorized transactions show their real categoría, with no category
  silently blanked to `null` due to an id-lookup miss

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

## Non-Goals

- Catalog CRUD (create, rename, delete a categoría or pattern) and any
  endpoint or UI for it — deferred to future work.
- Dismantling the closed `Categoria` TypeScript enum or the
  `CATEGORIA_BUCKET` total map — both remain untouched.
- Importing/merging suggested categories into an existing user's catalog.
- Any new signup flow — the copy hook only lands in the two user-creation
  points that exist today.
- Any frontend (`apps/web`, `apps/mobile`) change — category names are
  preserved by construction.
- Per-user `BucketPresupuesto` — buckets stay a global fixed taxonomy of 5.
- Template versioning or propagating later template edits to existing
  users' already-copied rows.
