# User Data Isolation Specification

## Purpose

Defines that the 7 data-bearing endpoints (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`, `resumen/semaforo`, `detalle-bucket-mes`, `ingresos-mes`) derive `userId` from the authenticated session — replacing the previously hardcoded `USER_ID_FIJO_TOKEN` — and that a user can never read another user's data (RNF-SEC-006, ADR-015). This holds regardless of which client is calling (web with a cookie session, or mobile with a Bearer session) — there is no keyless or session-less fallback for any of the 7 endpoints, including `/api/resumen` as consumed by `apps/mobile`.

## Requirements

### Requirement: ISO-01 — `userId` is derived from the session, not a fixed constant, for every client

(Previously: web-implicit. Revised: explicitly no keyless fallback for `/api/resumen` now that mobile authenticates via session too. Revised again, US-049: the count of session-guarded controllers grows from 4 to 5 with `resumen/semaforo`, which derives `userId` identically via the SAME session middleware already covering `resumen` — the rule itself is unchanged, only the count of controllers it applies to. Revised again, US-051: the count grows from 5 to 6 with the `detalle-bucket-mes` controller serving `GET /api/buckets/:bucket/detalle` — the rule remains unchanged, only the count of controllers it applies to. Revised again, US-052: the count grows from 6 to 7 with the `ingresos-mes` controller serving `GET /api/ingresos/mes` — the rule remains unchanged, only the count of controllers it applies to. Revised again, US-058: the count grows from 7 to 8 with the `POST /api/movimientos` handler — the rule is unchanged, only the endpoint count increases.)

Each of the 8 controllers (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`, `resumen/semaforo`, `detalle-bucket-mes`, `ingresos-mes`, and the new `POST /api/movimientos` handler) MUST resolve `userId` from the request's validated session (as exposed by `SessionGuard`, from either the cookie or `Authorization: Bearer` transport). None of them MUST inject or fall back to a hardcoded user id, and none MUST accept `x-api-key` alone as sufficient identity — a valid session is required on top of it, for both web and mobile callers.

#### Scenario: Data endpoint uses the session's userId

- GIVEN a user is logged in with a valid session
- WHEN they call any of the 7 data endpoints
- THEN the data returned belongs to the session's `userId`, not to any hardcoded constant

#### Scenario: Mobile `/api/resumen` call has no keyless fallback

- GIVEN the mobile app has a valid `x-api-key` but no stored session token
- WHEN it calls `GET /api/resumen`
- THEN the response status is 401
- AND no data is returned under a fallback/default `userId`

### Requirement: ISO-02 — Cross-user isolation across all 8 data endpoints, for both clients

A user authenticated as A MUST NOT be able to read or write data belonging to user B through any of the 8 data endpoints — `resumen`, `movimientos`, `detalle-bucket`, `ingesta`, `resumen/semaforo` (US-049), `detalle-bucket-mes` (US-051), `ingresos-mes` (US-052), and `POST /api/movimientos` (US-058) — regardless of request parameters or transport (cookie or Bearer). This isolation MUST hold for every value the `resumen` endpoint exposes, including the Sin categoría transaction count introduced by US-045 — the count aggregation MUST filter by the authenticated user's `userId` in the same WHERE clause as the existing per-bucket sums, never in application memory. This isolation MUST also hold for every value `resumen/semaforo` exposes (US-049) — the diagnosis sentence, the per-bucket CLP-to-Verde advice amounts and directions, the zone-band edges, and the Sin categoría count/total it re-exposes — for every value `detalle-bucket-mes` exposes (US-051): the header's `total`, `totalTransacciones`, `totalCategorias`, `porcentajeBp` and `metaBp`, and each category group's `subtotal`, `conteo` and transactions — for every value `ingresos-mes` exposes (US-052): the header's `total` and `conteo`, and each `transacciones` entry's `id`, `fecha`, `descripcion`, `origen` and `monto` — and for the `POST /api/movimientos` write (US-058): user B's manual movement MUST NOT appear in user A's resumen, bucket totals, movement list, or any aggregation — none of which MUST ever be derived from, or reflect, another user's transactions.

#### Scenario: User A cannot read user B's resumen (web cookie session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data
- AND no field of the response reflects B's amounts or buckets

#### Scenario: User A cannot read user B's resumen (mobile Bearer session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN the mobile app authenticated as A (via `Authorization: Bearer`) calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data, identically to the web-cookie case

#### Scenario: User A cannot read user B's Sin categoría count

- GIVEN two seeded users A and B, each with uncategorized cargo transactions in the same period — A with a distinct count/total from B's
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN A's Sin categoría count and total reflect only A's uncategorized cargo transactions
- AND B's Sin categoría count and total are never present or reflected in A's response, regardless of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's movimientos

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/movimientos?periodo=<period>`
- THEN only A's transactions are returned

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket
- WHEN a client logged in as A calls the bucket-detail endpoint for that bucket
- THEN only A's transactions for that bucket are returned

#### Scenario: User A cannot trigger or read user B's ingesta

- GIVEN two seeded users A and B
- WHEN a client logged in as A calls the ingesta endpoint
- THEN any created/read ingesta record is scoped to A, and B's ingesta records are never returned to A

#### Scenario: User A cannot read user B's semáforo diagnosis or advice (new, US-049)

- GIVEN two seeded users A and B, each with their own transactions for the same period, positioned in different semáforo states (e.g. A's Necesidades is Rojo, B's Necesidades is Verde)
- WHEN a client logged in as A calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN A's diagnosis names only A's own driving bucket, and A's CLP-to-Verde advice amounts are computed only from A's own totals
- AND none of B's bucket states, diagnosis wording, advice amounts, or Sin categoría numbers are present or reflected in A's response, regardless of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's bucket detalle mes (new, US-051)

- GIVEN two seeded users A and B, each with their own transactions in the same bucket for the same period
- WHEN a client logged in as A calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the response header (total, counts, `porcentajeBp`, `metaBp`) and every category group (`subtotal`, `conteo`, transactions) reflect only A's transactions
- AND none of B's transactions, group totals, or header values are present or reflected in A's response, regardless of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's income rows (new, US-052)

- GIVEN two seeded users A and B, each with their own income rows for the same period
- WHEN a client logged in as A calls `GET /api/ingresos/mes?periodo=<period>`
- THEN the `total`/`conteo` header and every `transacciones` entry (`id`, `fecha`, `descripcion`, `origen`, `monto`) reflect only A's income rows
- AND none of B's income rows, amounts, or origin names are present or reflected in A's response, regardless of transport (cookie or Bearer)

#### Scenario: User B's manual movement does not appear in user A's resumen (new, US-058)

- GIVEN user A has existing transactions in period M
- WHEN user B calls `POST /api/movimientos` with a valid manual movement request
- THEN `GET /api/resumen?periodo=M` for user A returns the same values as before
- AND user B's manual movement row belongs exclusively to user B
- AND user A's data is neither read nor modified by user B's write operation

### Requirement: ISO-03 — Preview and commit ingesta operations are scoped by userId (US-057, new)

The new `POST /api/ingestas/preview` and `POST /api/ingestas/commit` endpoints MUST scope all reads and writes by the authenticated user's `userId`. Preview MUST NOT create any database row, including an `Account` row, and MUST perform read-only operations only (dedup lookup, category lookup). Commit MUST validate that every category ID in the edits overlay belongs to the caller's own catalog (RNF-SEC-006).

#### Scenario: User B's preview cannot observe user A's transactions (new, US-057)

- GIVEN user A has a BancoEstado transaction with natural key K
- AND user B uploads a cartola that contains a row with the same natural key K
- WHEN user B calls `POST /api/ingestas/preview` with their own account
- THEN user B's dedup lookup reports `esDuplicado: false` for that row
- AND user A's data is not read, modified, or exposed in the preview response or side effects

#### Scenario: User B's preview creates no Account row (new, US-057)

- GIVEN user B calls `POST /api/ingestas/preview` with a valid cartola for a bank B has never imported from
- WHEN the preview returns successfully
- THEN zero `Account` rows exist for that `userId` + bank after the call
- AND all reads (dedup, catalog) are scoped by user B's `userId` only

#### Scenario: User B cannot commit into user A's category catalog (new, US-057)

- GIVEN user A has a `Categoria` with id `cat_A` belonging to user A's catalog
- AND user B sends `POST /api/ingestas/commit` with `edits: [{ "rowIndex": 0, "categoriaId": "cat_A" }]`
- WHEN the commit is processed
- THEN the response is 400 identifying the invalid `categoriaId`
- AND no rows are persisted for user B
- AND user A's category remains accessible only to user A

#### Scenario: User B's commit cannot modify user A's transactions (new, US-057)

- GIVEN user A has an `Account` with transaction history
- WHEN user B calls `POST /api/ingestas/commit` with a valid cartola and overlay
- THEN all persisted `Ingesta` and `Transaccion` rows belong exclusively to user B
- AND user A's `Account`, `Ingesta`, or `Transaccion` rows are not read, modified, or exposed
