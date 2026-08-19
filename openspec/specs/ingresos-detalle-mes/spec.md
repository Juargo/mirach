# Ingresos Detalle Mes Specification (apps/api — application/infrastructure)

## Purpose

Defines the observable contract of `GET /api/ingresos/mes?periodo=` (US-052, issue #286): the monthly
income list by origin (bank/Manual), a sibling to the US-051 bucket detail and consumed by US-054.
It is top-level (`/api/ingresos/mes`), NOT a sub-resource of buckets — `GET
/api/buckets/Ingresos/detalle` keeps rejecting `Ingresos` with a scrubbed 400 (MBD-07, US-051).
Additive: US-017 flat and US-051 grouped endpoints are untouched. Response
`{total: string, conteo: number, transacciones: [{id, fecha, descripcion, origen, monto}]}`; DTO
field names and JSON layout are design-phase decisions. Bank NAME may appear on the wire (US-017
precedent); `tipoCuenta`/`numeroCuenta` never (ADR-015).

Established by change us-052-mes-ingresos-detalle (2026-08-18), US-052 / issue #286.

## Requirements

### Requirement: MID-01 — Header total, count, and ordered transaction list with empty-month success (CA-01)

The system MUST return `{total: string, conteo: number, transacciones: [...]}`. `transacciones`
MUST follow the reader's deterministic order — `fecha` asc, `id` asc tie-break — and MUST NOT be
truncated or paged. A period with no income rows is SUCCESS: 200 with `total` `"0"`, `conteo` 0,
`transacciones` `[]`, never an error.

#### Scenario: Happy path exposes header and full ordered transaction list

- GIVEN a period with income rows from BCI and BancoEstado (3 transactions)
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN the response has shape `{total, conteo, transacciones}`
- AND `conteo` is 3, `total` is the exact Σ abono string, and each entry is only
  `{id, fecha, descripcion, origen, monto}`

#### Scenario: Empty income month returns 200 with zeros

- GIVEN a period with no income rows
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN the response status is 200
- AND `total` is `"0"`, `conteo` is 0, and `transacciones` is `[]`

#### Scenario: Transactions are ordered by fecha asc and id asc

- GIVEN income rows on days 3, 15 (id tx-a) and 15 (id tx-b) of the period
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN rows are returned day-3 first, then day-15 in `id` asc order (tx-a before tx-b)

### Requirement: MID-02 — `origen` is the account's bank name verbatim, `"Manual"` as dead-code fallback (CA-02)

The system MUST derive each row's `origen` at the application boundary as `fila.banco || "Manual"`,
with `fila.banco` exposed verbatim (no normalization, US-017 precedent). The `"Manual"` branch is
forward-compatible dead code — `ingestaId`/`accountId` are NOT NULL, so a missing bank never occurs
in production — and MUST be unit-proven via a fake reader in the hermetic app spec; it is NOT a data
model change in this US.

#### Scenario: Bank name appears verbatim on the wire

- GIVEN a fake reader yielding rows with `banco: "Santander"` and `banco: "BancoEstado"`
- WHEN the app assembles the response
- THEN `origen` is `"Santander"` and `"BancoEstado"` respectively, unmodified

#### Scenario: Manual fallback is unit-proven via a fake reader

- GIVEN a fake reader yielding a row with an empty `banco`
- WHEN the app assembles the response
- THEN `origen` is `"Manual"` for that row

### Requirement: MID-03 — No meta, percentage, or estado anywhere in the DTO (CA-03)

Ingresos do not participate in 50/30/20 as `gasto`, so the system MUST NOT expose `meta`,
`porcentaje`, or `estado` at the top level or inside `transacciones`. The response schema MUST be
Zod `.strict()` so any stray key fails parse — a wire guarantee (OpenAPI `additionalProperties:
false`), not just mapper discipline.

#### Scenario: No meta/porcentaje/estado keys appear in the response

- GIVEN a period with income rows
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN no `meta`, `porcentaje`, or `estado` key appears anywhere in the response

#### Scenario: Leaf schema rejects a stray PII key

- GIVEN a payload whose `transacciones` entry carries an extra key (e.g. `tipoCuenta`)
- WHEN the `.strict()` response schema parses it
- THEN parsing fails with the extra key reported

### Requirement: MID-04 — Absent period defaults to the current month; invalid period is a scrubbed 400 (CA-04)

WHEN `periodo` is absent, the system MUST resolve the current calendar month, identically to
`resumen-mensual`. WHEN present but invalid per the domain's `YYYY-MM` rule, the system MUST return
400 (`PeriodoInvalidoError`) with a scrubbed message that never echoes the raw input.

#### Scenario: Absent period defaults to the current month

- GIVEN a client calls `GET /api/ingresos/mes` with no `periodo`
- WHEN the request is processed
- THEN the response reflects the current calendar month

#### Scenario: Invalid period is rejected with a scrubbed 400

- GIVEN a client calls `GET /api/ingresos/mes?periodo=13-2026`
- WHEN the request is processed
- THEN the response status is 400
- AND the error message does not contain the raw invalid value

### Requirement: MID-05 — Amounts are positive BigInt-safe strings; total sums abono of bucket-ingreso rows (CA-05)

Every monetary value (`total`, `monto`) MUST be a BigInt-safe string, exact beyond
`Number.MAX_SAFE_INTEGER`, never a float. `total` MUST be Σ `abono` over the rows returned by
`IDetalleBucketReader.findByPeriodoYBucket(userId, periodo, Bucket.Ingreso)` — the bucket filter
already encodes the categorization rule (`esIngreso` ⇒ cargo = 0 ∧ abono > 0); the use case MUST NOT
re-apply a sign rule, and a row with `abono > 0 && cargo > 0` is a SPEND row that never lands in
bucket-ingreso. `monto` MUST be the row's positive `abono`. Reconciliation: for the same user and
period, `total` MUST equal `resumen-mensual`'s Ingreso `totalAbono`.

#### Scenario: Total is exact beyond MAX_SAFE_INTEGER

- GIVEN income rows whose abono sum exceeds `Number.MAX_SAFE_INTEGER`
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN `total` and each `monto` are strings exactly representing the values with no precision loss

#### Scenario: Monto is always a positive string

- GIVEN income rows in bucket-ingreso
- WHEN a client calls `GET /api/ingresos/mes?periodo=<period>`
- THEN every `monto` is a positive string (never prefixed with `-`)

#### Scenario: Total reconciles with resumen-mensual's Ingreso totalAbono

- GIVEN the same user and period with income rows (and a SPEND row with `abono > 0 && cargo > 0`)
- WHEN a client calls both `GET /api/ingresos/mes` and `GET /api/resumen?periodo=<period>`
- THEN this endpoint's `total` equals the resumen Ingreso `totalAbono`, and the SPEND row is
  excluded from both

### Requirement: MID-06 — The endpoint is userId-scoped, cross-user isolated, and PII-bounded (CA-06, RNF-SEC-006)

The endpoint MUST resolve `userId` from the authenticated session (cookie or Bearer) and MUST scope
the reader's query by that `userId` (`account: { userId }`). A request without a valid session MUST
be rejected with 401. A user A MUST NOT read user B's income data regardless of parameters or
transport. `origen` (bank NAME) MAY appear on the wire; `tipoCuenta`/`numeroCuenta` MUST NEVER —
the `.strict()` leaf schema (MID-03) is the wire guarantee. See the `user-data-isolation` delta
(6 → 7) for the ISO-01/ISO-02 text changes.

#### Scenario: Request without a session is rejected with 401

- GIVEN a request with a valid `x-api-key` but no session (no cookie, no Bearer)
- WHEN it calls `GET /api/ingresos/mes?periodo=<period>`
- THEN the response status is 401

#### Scenario: User A cannot read user B's income rows

- GIVEN two seeded users A and B with distinct income rows for the same period
- WHEN a client logged in as A calls `GET /api/ingresos/mes?periodo=<period>`
- THEN `total`, `conteo`, and every `transacciones`/`origen` entry reflect only A's rows
- AND no field reflects B's data, regardless of transport (cookie or Bearer)