# Resumen Mensual Specification (apps/api — domain/application/infrastructure)

## Purpose

Defines the observable contract of `GET /api/resumen`: the monthly breakdown
must expose 5 economic items — **Necesidades**, **Deseos**, **Ahorro**
(spend buckets, unchanged), **Ingresos** (amount only, no percentage), and
**Sin categoría** (count + total + percentage). This spec covers what the
response MUST contain and how each value MUST be computed; it does not
prescribe field names, DTO shape, or JSON layout — those are design-phase
decisions. Web/mobile rendering is out of scope (US-047); annual aggregation
of the new values is out of scope (US-046).

## Requirements

### Requirement: RES-01 — Ingresos is exposed as an amount-only item, never a percentage

The response MUST expose the total Ingresos amount for the requested period.
Ingresos MUST NOT carry a percentage value of any kind (it is the base other
percentages are computed against, not a slice of itself) and MUST NOT go
through the semáforo classification.

#### Scenario: Ingresos amount is present with no percentage field populated

- GIVEN a period with income transactions totaling a known amount
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the response exposes the Ingresos total for that period
- AND the response does not expose a non-null percentage for Ingresos
- AND the response does not expose a semáforo state for Ingresos

#### Scenario: Ingresos amount is zero when the period has no income

- GIVEN a period with zero income transactions
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Ingresos amount in the response is present and equals zero
  (not null, not omitted)

### Requirement: RES-02 — Sin categoría exposes a transaction count of uncategorized cargos

The response MUST expose, for Sin categoría, a count of the cargo
(expense-direction) transactions that could not be classified into
Necesidades, Deseos, or Ahorro for the requested period. The count scope is
cargos only. This scope rests on the domain invariant enforced by
`Transaccion.crear` (débito XOR crédito — a transaction can never have both
`cargo>0` and `abono>0`; `TransaccionInvalidaError('CARGO_Y_ABONO')` rejects
that combination at creation): consequently every transaction with
`abono>0` has `cargo===0` and satisfies the Ingreso rule
(`abono>0 && cargo===0`) by construction. There is no such thing as a
"non-Ingreso abono transaction" reachable through the normal transaction
pipeline — an abono is always an Ingreso. Ingreso transactions MUST NOT be
counted in Sin categoría regardless of category.

#### Scenario: Count reflects only uncategorized cargo transactions

- GIVEN a period with 3 uncategorized cargo transactions, 1 categorized
  cargo transaction (falls into Necesidades), and 1 Ingreso transaction
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Sin categoría count in the response equals 3

#### Scenario: An unclassified Ingreso-shaped row is excluded from the count

- GIVEN a period with 1 uncategorized cargo transaction (`cargo>0,
  abono===0`) and 1 row that is Ingreso-shaped (`abono>0, cargo===0`) but was
  left with `bucketId: null` — a state reachable ONLY by direct DB seeding
  (e.g. an integration test) or by a writer failure that persists an Ingreso
  row without resolving its bucket (`process-ingesta.use-case.ts`); the
  normal classification pipeline always resolves Ingreso rows to
  `Bucket.Ingreso`
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Sin categoría count in the response equals 1 (the unclassified
  Ingreso-shaped row is excluded because the count query filters on
  `cargo > 0`, not on `bucketId`)

#### Scenario: Count is zero when every transaction was classified

- GIVEN a period where every cargo transaction was classified into
  Necesidades, Deseos, or Ahorro
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Sin categoría count in the response is present and equals zero
  (not null, not omitted)

### Requirement: RES-03 — Sin categoría exposes a total and a percentage over Ingresos del mes

The response MUST expose, for Sin categoría, the total amount of the
uncategorized cargo transactions (as scoped by RES-02) and its percentage,
computed over the same base as the 3 spend buckets (total Ingresos for the
period).

#### Scenario: Sin categoría percentage uses the same base as spend buckets

- GIVEN a period with total Ingresos of a known amount and a known Sin
  categoría total
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Sin categoría percentage equals the Sin categoría total divided
  by total Ingresos, using the same basis-points computation as
  Necesidades/Deseos/Ahorro (RES-06)

#### Scenario: Sin categoría percentage is absent/null when there is no income

- GIVEN a period with zero Ingresos and at least one uncategorized cargo
  transaction
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the Sin categoría percentage in the response is null (no
  division by zero), consistent with how the 3 spend buckets behave in a
  no-income month

### Requirement: RES-04 — All 5 values are always present with stable zero/empty defaults

The response MUST always include a value for all 5 items (Necesidades,
Deseos, Ahorro, Ingresos, Sin categoría), regardless of whether the period
has any data. Absent data MUST be represented with the item's stable
zero/empty default (0 for amounts and counts, null for percentages/semáforo
where applicable) — items MUST NOT be omitted from the response.

#### Scenario: Empty month still returns all 5 items with zero defaults

- GIVEN a period with zero transactions of any kind
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the response includes all 5 items
- AND every amount is zero, every count is zero, and every percentage is
  null

### Requirement: RES-05 — `estadoGlobal` (semáforo) considers only the 3 spend buckets

The global semáforo state MUST derive exclusively from Necesidades, Deseos,
and Ahorro. Ingresos and Sin categoría MUST NOT influence `estadoGlobal` in
any way, and MUST NOT themselves carry a non-null semáforo state.

#### Scenario: A Sin categoría spike does not change estadoGlobal

- GIVEN a period where Necesidades/Deseos/Ahorro are all within healthy
  thresholds, but Sin categoría's amount is large relative to Ingresos
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN `estadoGlobal` reflects only the Necesidades/Deseos/Ahorro states
- AND the Sin categoría item's semáforo state is null
- AND the Ingresos item exposes no semáforo state

#### Scenario: estadoGlobal is worst-of only among the 3 spend buckets

- GIVEN a period where Necesidades is in a warning state and Deseos/Ahorro
  are healthy
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN `estadoGlobal` equals Necesidades' warning state
- AND this result is unaffected by Ingresos' or Sin categoría's values

### Requirement: RES-06 — All percentages use basis-points, round-half-up, BigInt-safe arithmetic

Every percentage exposed in the response (for the 3 spend buckets and for
Sin categoría) MUST be computed in basis points (10000 = 100.00%) using
integer round-half-up division. No floating-point arithmetic MUST be used
anywhere in the computation path. All monetary amounts (totals) MUST be
represented as strings in the response, safe for values exceeding
`Number.MAX_SAFE_INTEGER`.

#### Scenario: A non-terminating percentage rounds half-up, not down or via float

- GIVEN a Sin categoría total and an Ingresos total whose ratio does not
  terminate in basis points (e.g. produces a .5 remainder at the
  basis-point boundary)
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the resulting percentage is the round-half-up value in basis points,
  identical to the rounding rule already applied to Necesidades/Deseos/Ahorro

#### Scenario: Large amounts are returned as strings without precision loss

- GIVEN a period with an Ingresos or Sin categoría total larger than
  `Number.MAX_SAFE_INTEGER`
- WHEN a client calls `GET /api/resumen?periodo=<period>`
- THEN the amount is exposed as a string that exactly represents the value,
  with no precision loss

### Requirement: RES-07 — The period follows the cut-off day (issue #111)

`GET /api/resumen` and each month of `GET /api/resumen/anual` MUST use the financial month of
perfil-presupuesto PPR-07: `periodo=YYYY-MM` is the period that starts on the user's cut-off day of
that month (decision: the month the period starts in), and the response MUST carry `fechaInicio`
and `fechaFin` (`YYYY-MM-DD`, inclusive). Income credits use the tolerance window of PPR-07 only when
the cut-off day is not 1. `GET /api/periodos` MUST list the financial months with data and return
`rangos: [{ periodo, fechaInicio, fechaFin }]` in the same order as `periodos`. An absent `periodo`
resolves to the latest period with at least one transaction; the period in progress only when there
is none.

#### Scenario: todos los períodos se muestran del 25 al 24

- Dado un corte el día 1
- Cuando Marcela cambia el corte al día 25
- Entonces `GET /api/resumen?periodo=2026-10` devuelve `fechaInicio` `2026-10-25` y `fechaFin` `2026-11-24`
- Y cada elemento de `rangos` en `GET /api/periodos` va del 25 al 24

#### Scenario: Cut-off 1 keeps the calendar month

- GIVEN a user with `diaCorte` 1
- WHEN they call `GET /api/resumen?periodo=2026-02`
- THEN `fechaInicio` is `2026-02-01` and `fechaFin` is `2026-02-28`

### Requirement: RES-08 — Ingresos is the base of rule 1 (issue #111, VIS-10)

The Ingresos amount (`totalIngreso`) MUST be the base of perfil-presupuesto PPR-08: the declared
monthly income when the user has one, otherwise the sum of the period's income credits. The response
MUST carry `fuenteIngreso` (`declarado` | `detectado`) and `ingresoDetectado`. Every percentage of
RES-03 and RES-06 uses that base. A period without any movement MUST stay `sinIngreso` with
`totalIngreso` `"0"` and `fuenteIngreso` `detectado`, also in `GET /api/resumen/anual`.

#### Scenario: A declared income replaces the detected one as the base

- GIVEN a user with `ingresoDeclarado` `"2000000"` and income credits of 1000000 in the period
- WHEN they call `GET /api/resumen?periodo=<period>`
- THEN `totalIngreso` is `"2000000"`, `fuenteIngreso` is `declarado` and `ingresoDetectado` is `"1000000"`

#### Scenario: An empty month of the year has no verdict

- GIVEN a user with `ingresoDeclarado` `"2000000"` and movements only in March
- WHEN they call `GET /api/resumen/anual`
- THEN every month but March has `sinIngreso` true and `fuenteIngreso` `detectado`
