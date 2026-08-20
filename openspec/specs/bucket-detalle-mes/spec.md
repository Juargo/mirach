# Bucket Detalle Mes Specification (apps/api — domain/application/infrastructure)

## Purpose

Defines the observable contract of `GET /api/buckets/:bucket/detalle?periodo=` — a sibling detail
endpoint to the flat `GET /api/buckets/:bucket?periodo=` (US-017 drill-down) that returns the
month×bucket detail GROUPED by category: a header with totals and % vs meta, and category groups
carrying ALL their transactions. It is additive: the flat US-017 endpoint stays deployed and
behaviorally unchanged — its only web consumer, the dashboard's interim US-047 panel, was retired
by US-053 (MBD-09). Ingresos is out of scope (US-052) and rejected on this route. This spec covers what the response MUST
contain and how each value MUST be computed; DTO field names and JSON layout are design-phase
decisions. Client-side rendering is covered by `web-app` (US-053, separate change).

Established by change us-051-mes-bucket-detalle (2026-08-17), US-051 / issue #285.

## Requirements

### Requirement: MBD-01 — Header exposes total, transaction count, category count, and % vs meta as BigInt-safe values (CA-01)

The response MUST expose a header with `total` (the bucket's accumulated spend for the period, as a
BigInt-safe string), `totalTransacciones` (number of transactions), `totalCategorias` (number of
category groups in the payload, INCLUDING the synthetic Sin categoría group when present — for the
SinCategoria bucket this is always 1), `porcentajeBp` (% vs meta, in basis points, round-half-up)
and `metaBp` (the bucket's target from `BANDAS_SEMAFORO`; null when the bucket has no rule, e.g.
SinCategoria). A period with no transactions for the bucket is a SUCCESS case: 200 with zeroed
totals and an empty `grupos` array, never an error.

#### Scenario: Header exposes correct BigInt string and basis-point values

- GIVEN a period with income and a Necesidades bucket spend of 250000 CLP
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN `total` is the string `"250000"`, `metaBp` is 5000, and `porcentajeBp` equals the
  round-half-up percentage of 250000 against the period's income

#### Scenario: An empty bucket month returns 200 with zeroed totals

- GIVEN a period with income but no transactions in the requested bucket
- WHEN a client calls `GET /api/buckets/Ahorro/detalle?periodo=<period>`
- THEN the response status is 200
- AND `total` is `"0"`, `totalTransacciones` is 0, `totalCategorias` is 0, and `grupos` is empty

### Requirement: MBD-02 — Category groups carry ALL of the bucket's transactions, es-CL alphabetical, "Sin categoría" last (CA-02)

The response MUST expose `grupos`, one entry per category present in the period, plus a synthetic
Sin categoría group when the bucket contains null-categoria rows (and always for the SinCategoria
bucket itself). Each group MUST expose `categoriaId` (null for Sin categoría), `nombre` (the
category's name, or "Sin categoría" for the synthetic group), `subtotal` (sum of the group's
transaction `monto`, as a BigInt-safe string), `conteo` (transaction count), and `transacciones` —
the COMPLETE list of that group's transactions, each `{id, fecha, descripcion, monto}` with `monto`
equal to the cargo amount. The response MUST NOT truncate or page transactions. Groups MUST be
ordered by `nombre` using es-CL locale collation, with the Sin categoría group ALWAYS last.
Transactions within a group MUST follow the reader's deterministic order (fecha asc, id asc).

#### Scenario: Groups carry all transactions with the agreed shape

- GIVEN a Deseos bucket month with 2 categories ("Comida" with 3 transactions, "Transporte" with 2)
- WHEN a client calls `GET /api/buckets/Deseos/detalle?periodo=<period>`
- THEN `grupos` has 2 entries, each with shape
  `{categoriaId, nombre, subtotal, conteo, transacciones}`
- AND each `transacciones` entry exposes only `{id, fecha, descripcion, monto}` with `monto` equal
  to the cargo amount
- AND ALL 5 transactions are present — none truncated or paged

#### Scenario: Groups are ordered es-CL alphabetical with "Sin categoría" last

- GIVEN a bucket month containing categories "Zapatería", "Ñoquis", and Sin categoría rows
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the group order is "Ñoquis", "Zapatería", then "Sin categoría" last

#### Scenario: Null-categoria rows in a real bucket fold into a synthetic Sin categoría group

- GIVEN a Necesidades bucket month with categorized transactions plus 2 uncategorized cargo rows
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN a synthetic group with `categoriaId` null and `nombre` "Sin categoría" carries those 2 rows
- AND `totalCategorias` counts that synthetic group

### Requirement: MBD-03 — Sin categoría exposes no meta and no % vs meta (CA-03)

For the SinCategoria bucket, `metaBp` MUST be null because `BANDAS_SEMAFORO` contains no rule for
Sin categoría, and consequently `porcentajeBp` MUST also be null. No special-casing and no
synthetic default rule: the single threshold table is the only source of truth (for real buckets
`metaBp` comes from that same table — Necesidades 5000, Deseos 3000, Ahorro 2000).

#### Scenario: SinCategoria bucket returns null metaBp and null porcentajeBp

- GIVEN a period with uncategorized cargo transactions and income
- WHEN a client calls `GET /api/buckets/SinCategoria/detalle?periodo=<period>`
- THEN `metaBp` is null
- AND `porcentajeBp` is null

### Requirement: MBD-04 — Absent period defaults to the current month; invalid period is rejected with a scrubbed 400 (CA-04)

WHEN `periodo` is absent, the endpoint MUST resolve the current calendar month, identically to
`resumen-mensual`. WHEN `periodo` is present but invalid per the domain's `YYYY-MM` rule, the
endpoint MUST return 400 (`PeriodoInvalidoError`) with a scrubbed message that never echoes the raw
input value.

#### Scenario: Absent period defaults to the current month

- GIVEN a client calls `GET /api/buckets/Necesidades/detalle` with no `periodo` param
- WHEN the request is processed
- THEN the response reflects the current calendar month

#### Scenario: Invalid period is rejected with a scrubbed 400

- GIVEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=13-2026`
- WHEN the request is processed
- THEN the response status is 400
- AND the error message does not contain the raw invalid value

### Requirement: MBD-05 — All monetary values are BigInt-safe strings and percentages use round-half-up (CA-05)

Every monetary value in the response (`total`, `subtotal`, `monto`) MUST be a BigInt-safe string —
exact beyond `Number.MAX_SAFE_INTEGER`, never a float. Every basis-point percentage
(`porcentajeBp`) MUST be computed with the round-half-up rule of the shared `porcentajeBasisPoints`
helper; no floating-point arithmetic MAY be used in the computation path.

#### Scenario: Amounts beyond MAX_SAFE_INTEGER are exposed exactly

- GIVEN a bucket whose accumulated spend exceeds `Number.MAX_SAFE_INTEGER`
- WHEN a client calls `GET /api/buckets/Ahorro/detalle?periodo=<period>`
- THEN `total` and each group `subtotal`/`monto` are strings exactly representing the values with no
  precision loss

#### Scenario: porcentajeBp uses round-half-up against the shared helper

- GIVEN a bucket spend and income whose exact ratio ends in a half basis point
- WHEN `porcentajeBp` is computed
- THEN it equals the `porcentajeBasisPoints` round-half-up result for the same inputs

### Requirement: MBD-06 — The endpoint is userId-scoped and cross-user isolated (CA-06, RNF-SEC-006)

The endpoint MUST resolve `userId` from the authenticated session (cookie or Bearer) and MUST scope
every query by that `userId` in the WHERE clause — the same rule as the other data endpoints
(`user-data-isolation` ISO-01/ISO-02, extended 5→6 in this change's isolation delta). A request
without a valid session MUST be rejected with 401. A user A MUST NOT read user B's bucket detail
regardless of parameters or transport.

#### Scenario: Request without a session is rejected with 401

- GIVEN a request with a valid `x-api-key` but no session (no cookie, no Bearer)
- WHEN it calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the response status is 401

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket for the same period
- WHEN a client logged in as A calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the response contains only A's transactions, groups, and header values
- AND no field reflects B's data

### Requirement: MBD-07 — Route accepts only the four spend buckets; Ingresos is rejected with a scrubbed 400

The route MUST accept the allowlist {Necesidades, Deseos, Ahorro, SinCategoria}. Any other bucket —
including `Ingresos` (US-052, out of scope) — MUST be rejected with 400 (`BucketInvalidoError`) and
a scrubbed message that does not echo the raw bucket value.

#### Scenario: Ingresos is rejected with 400 BucketInvalidoError

- GIVEN a client with a valid session calls `GET /api/buckets/Ingresos/detalle?periodo=<period>`
- WHEN the request is processed
- THEN the response status is 400
- AND the message references an invalid bucket without echoing the raw value

### Requirement: MBD-08 — The response carries no account PII (ADR-015)

The response MUST NOT expose `banco`, `tipoCuenta`, or `numeroCuenta` anywhere — not in the header,
not inside `transacciones`. Transaction entries carry only `{id, fecha, descripcion, monto}` per
MBD-02. The flat US-017 endpoint keeps its full shape; this grouped endpoint trims per the
proposal's PII decision.

#### Scenario: Account fields are absent even when source rows carry them

- GIVEN a period whose source transactions have bank, account-type, and account-number values
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN no `banco`, `tipoCuenta`, or `numeroCuenta` key appears anywhere in the response

### Requirement: MBD-09 — The flat US-017 endpoint loses its sole web consumer when US-053 retires the interim panel (informational note)

As of US-053, `apps/web`'s `/buckets/:bucket` page consumes the grouped endpoint (MBD-01..08) and the
dashboard's inline US-047 panel — the flat US-017 endpoint's only web consumer — is retired (web-app
WDM-06/WCAT-01). The flat endpoint MUST remain deployed and behaviorally unchanged (US-053 rollback path):
no backend contract, implementation, or test in this spec changes; its consumer count is a web-app
concern, not a backend behavior.

#### Scenario: The flat endpoint responds unchanged after US-053 ships

- GIVEN US-053 is shipped and the dashboard panel is retired
- WHEN a client calls `GET /api/buckets/Necesidades?periodo=<period>`
- THEN it responds exactly as its own (unchanged) contract specifies — this spec's MBD-01..08 are
  unaffected
