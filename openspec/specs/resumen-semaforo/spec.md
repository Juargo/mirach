# Resumen Semáforo Detail Specification (apps/api — domain/application/infrastructure)

## Purpose

Defines the observable contract of `GET /api/resumen/semaforo?periodo=` — a sibling detail
endpoint to `GET /api/resumen` (`resumen-mensual` spec) that exposes the semáforo classification's
WHY and WHAT-TO-DO: the zone-band edges used to classify each spend bucket, a backend-generated
Spanish diagnosis sentence naming the bucket driving the global state, and a CLP amount (with
direction) that would return each Amarillo/Rojo bucket to Verde. This spec covers what the
response MUST contain and how each value MUST be computed; it does not prescribe DTO field names
or JSON layout — those are design-phase decisions. Web rendering of this data is covered by the
`web-app` capability's `WSEM-*` family (a separate delta in this same change, US-049). This
endpoint does not modify `GET /api/resumen`'s own payload (out of scope, per the proposal).

Established by change us-049-semaforo-detalle (2026-08-16), US-049 / issue #283.

## Requirements

### Requirement: SEM-01 — Response exposes the resolved period, global estado, and a backend-generated diagnosis naming the driving bucket (CA-01, CA-02)

The response MUST expose the resolved período (format `YYYY-MM`), `estadoGlobal` (the same
worst-of-3 computation `resumen-mensual` RES-05 already defines, over Necesidades/Deseos/Ahorro
only), and a diagnosis: a single Spanish sentence, generated entirely server-side, that names
EVERY bucket whose own estado equals `estadoGlobal`'s severity — when two or three buckets share
the worst severity, the diagnosis MUST name all of them, listed in the fixed bucket order
Necesidades, Deseos, Ahorro (mirroring `calcularEstadoGlobal`'s iteration order); no bucket
sharing the worst severity MUST be silently dropped — or the diagnosis states no bucket needs
attention when `estadoGlobal` is Verde. The diagnosis text MUST be entirely backend-owned
(ADR-024): the client renders the string verbatim, with no re-derivation or templating
client-side.

#### Scenario: Diagnosis names the driving bucket when the global state is Amarillo or Rojo

- GIVEN a period where Necesidades is Amarillo and Deseos/Ahorro are Verde
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN `estadoGlobal` equals Amarillo
- AND the diagnosis is a Spanish sentence naming Necesidades as the bucket driving the state

#### Scenario: A tie between two off-track buckets names both, in the fixed bucket order

- GIVEN a period where Necesidades and Deseos are both Rojo (the highest severity) and Ahorro is
  Verde
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN the diagnosis names BOTH Necesidades and Deseos — in the fixed order Necesidades, Deseos,
  Ahorro — with neither bucket omitted

#### Scenario: Diagnosis reflects a healthy month when `estadoGlobal` is Verde

- GIVEN a period where Necesidades, Deseos, and Ahorro are all Verde
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN `estadoGlobal` equals Verde
- AND the diagnosis is a Spanish sentence that does not name any bucket as needing attention

### Requirement: SEM-02 — Each spend bucket exposes its own zone-band edges AND its target percentage (`metaBp`) on the wire, derived from the user's budget profile

The response MUST expose, per spend bucket (Necesidades, Deseos, Ahorro), its `porcentajeBp`, its
`estadoSemaforo` (mirrors `resumen-mensual`), its `metaBp` — the bucket's target center in basis
points, taken from the user's budget profile (`perfil-presupuesto`, issue #110) — AND the band
edges (in basis points) used to compute that estado. The bands keep the 50/30/20 offsets around
the target: Necesidades and Deseos `verdeMax = metaBp`, `amarMax = metaBp + 1000`; Ahorro
`verdeMin = metaBp`, `verdeMax = metaBp + 2000`, outer Amarillo edges `metaBp − 1000` and
`metaBp + 3000`. The edges and `metaBp` MUST come from the same function the classifier uses
(`bandasParaMeta`), so the wire never carries a second copy that could drift from the
classification or from `resumen-mensual`'s targets.

#### Scenario: Default profile exposes the 50/30/20 band edges

- GIVEN a user with the default 50/30/20 profile
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Necesidades exposes `verdeMax=5000` and `amarMax=6000`, Deseos `3000`/`4000`, and Ahorro
  all 4 edges `1000`, `2000`, `4000`, `5000` — the `BANDAS_SEMAFORO` table, which is
  `bandasParaMeta` applied to 50/30/20

#### Scenario: The bands move with the profile target

- GIVEN a user whose profile is 80/10/10
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Necesidades' `metaBp` is `8000` with `verdeMax=8000` and `amarMax=9000`, and Ahorro's
  `metaBp` is `1000` with edges `0`, `1000`, `3000`, `4000`
- AND each bucket's `estadoSemaforo` and advice (SEM-03) are computed against those edges

#### Scenario: Band edges do not depend on that period's own data

- GIVEN two different periods with different bucket percentages and the same profile
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>` for each
- THEN the band edges returned for each bucket are identical across both responses

#### Scenario: `metaBp` matches the targets of `resumen-mensual`

- GIVEN any period
- WHEN a client calls `GET /api/resumen/semaforo` and `GET /api/resumen` for that period
- THEN each bucket's `metaBp` is the same in both responses, and equals the user's profile target

### Requirement: SEM-03 — Every Amarillo/Rojo bucket exposes a CLP amount and direction that would return it to Verde; Ahorro covers both directions (CA-05)

Every spend bucket whose `estadoSemaforo` is Amarillo or Rojo MUST expose a CLP amount (as a
BigInt-safe string) and a `direccion` (`'reducir'` | `'aumentar'`) such that applying that amount
to the bucket's total would recompute its `porcentajeBp` inside the Verde band (SEM-04 makes this
testable). Necesidades and Deseos, being unilateral (only "spend less" is a valid corrective
action for either), MUST always expose `direccion='reducir'`. Ahorro, being bidirectional, MUST
expose `direccion='aumentar'` when its `porcentajeBp` is below the Verde band's lower edge
(`2000`bp) and `direccion='reducir'` when above the Verde band's upper edge (`4000`bp). A bucket
whose `estadoSemaforo` is Verde MUST NOT expose an advice amount (null/absent).

EXCEPTION (fail-closed, design D-11): in the rare pathological case where NO CLP amount can be
verified to land the bucket inside Verde (near-zero income base — the runtime re-apply
post-condition fails), the bucket exposes NO advice (null/absent) even though its estado is
Amarillo/Rojo. Wrong advice is never shipped; absence is the correct degraded behavior. SEM-04's
re-apply verification only applies to advice that IS exposed.

#### Scenario: An over-target Necesidades exposes a reduce-only amount

- GIVEN a period where Necesidades' `porcentajeBp` is 6500 (Rojo)
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Necesidades exposes `direccion='reducir'` and a positive CLP amount

#### Scenario: A below-band Ahorro exposes an increase amount

- GIVEN a period where Ahorro's `porcentajeBp` is 1500 (Amarillo, below the 2000bp Verde floor)
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Ahorro exposes `direccion='aumentar'` and a positive CLP amount

#### Scenario: An above-band Ahorro exposes a reduce amount

- GIVEN a period where Ahorro's `porcentajeBp` is 4500 (Amarillo, above the 4000bp Verde ceiling)
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Ahorro exposes `direccion='reducir'` and a positive CLP amount

#### Scenario: A Verde bucket exposes no advice amount

- GIVEN a period where Deseos' `porcentajeBp` is 2500 (Verde)
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Deseos exposes no CLP amount and no `direccion` (null/absent)

### Requirement: SEM-04 — ROUNDING-CORRECTNESS: the advised amount, re-applied, MUST land the recomputed `porcentajeBp` inside Verde (CA-05)

For every Amarillo/Rojo bucket, applying its advised CLP amount in its stated direction to the
bucket's total (add for `'aumentar'`, subtract for `'reducir'`), then recomputing `porcentajeBp`
against the SAME `totalIngreso` via `porcentajeBasisPoints`'s round-half-up rule
(`resumen-mensual` RES-06), MUST produce a value that satisfies the Verde condition for that
bucket (≤ `verdeMax` for Necesidades/Deseos; within `[2000, 4000]` inclusive for Ahorro). This
MUST hold even at exact boundary values where round-half-up could otherwise push the recomputed
bp one basis point past the edge — the advice amount MUST be derived with rounding-direction
awareness, not by naively inverting the classification formula.

#### Scenario: Re-applying Necesidades' advice lands the recomputed bp at or below `verdeMax`

- GIVEN a period where Necesidades' `porcentajeBp` is 6001 (just over Rojo's own threshold)
  against a known `totalIngreso`
- WHEN the advised CLP amount is subtracted from Necesidades' total and `porcentajeBp` is
  recomputed with the same `totalIngreso`
- THEN the recomputed `porcentajeBp` is ≤ 5000 (Necesidades' `verdeMax`)

#### Scenario: Re-applying Ahorro's low-side advice lands the recomputed bp at or above the Verde floor

- GIVEN a period where Ahorro's `porcentajeBp` is 1999 (just under the Verde floor) against a
  known `totalIngreso`
- WHEN the advised CLP amount is added to Ahorro's total and `porcentajeBp` is recomputed with the
  same `totalIngreso`
- THEN the recomputed `porcentajeBp` is ≥ 2000 and ≤ 4000

#### Scenario: A round-half-up boundary that would naively overshoot by one basis point still corrects correctly

- GIVEN a `totalIngreso` and bucket total chosen so that a naive (non-boundary-aware) advised
  amount would recompute to exactly `verdeMax + 1` basis points under round-half-up
- WHEN the advised amount is applied and `porcentajeBp` is recomputed
- THEN the recomputed value is ≤ `verdeMax`, never `verdeMax + 1` — proving the advice derivation
  accounts for the rounding boundary rather than inverting the formula naively

### Requirement: SEM-05 — Sin categoría count and total are re-exposed, never recomputed independently (CA-06)

The response MUST expose, for Sin categoría, the same count and total that `GET /api/resumen`
already exposes for the same period (`resumen-mensual` RES-02/RES-03). This endpoint MUST NOT
recompute these values from a different query path — reusing the same reader avoids drift between
the dashboard and the detail page.

#### Scenario: Sin categoría count and total match `/api/resumen` for the same period

- GIVEN a period with a known Sin categoría count and total
- WHEN a client calls both `GET /api/resumen?periodo=<period>` and
  `GET /api/resumen/semaforo?periodo=<period>`
- THEN both responses expose the identical Sin categoría count and total

### Requirement: SEM-06 — A no-income month returns a self-explanatory shape instead of empty percentages (CA-07)

WHEN `totalIngreso` is zero for the requested period, the response MUST expose `sinIngreso=true`
(or equivalent), every spend bucket's `porcentajeBp` and `estadoSemaforo` as null, `estadoGlobal`
as null, and a diagnosis sentence that explains the no-income state rather than a generic or blank
diagnosis. No bucket MUST expose a CLP-to-Verde advice amount in this state — there is no
meaningful "return to Verde" measurement when there is no income to measure against.

#### Scenario: A zero-income period returns null percentages/estados and a no-income diagnosis

- GIVEN a period with zero income transactions
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN `sinIngreso` is true, every bucket's `porcentajeBp` and `estadoSemaforo` are null, and
  `estadoGlobal` is null
- AND the diagnosis explains that there is no income for the period, not a generic empty message
- AND no bucket exposes a CLP-to-Verde advice amount

### Requirement: SEM-07 — All monetary and percentage arithmetic is BigInt-safe and round-half-up (mirrors RES-06)

Every amount (bucket totals and CLP advice amounts) MUST be represented as BigInt-safe strings,
safe for values exceeding `Number.MAX_SAFE_INTEGER`. Every percentage (`porcentajeBp`) MUST be
computed via the same round-half-up basis-points rule already governing `resumen-mensual` RES-06.
No floating-point arithmetic MUST be used anywhere in the computation path, including the
CLP-to-Verde derivation (SEM-03/SEM-04).

#### Scenario: Advice amounts are returned as precision-safe strings

- GIVEN a period whose advised CLP amount for an off-track bucket exceeds
  `Number.MAX_SAFE_INTEGER`
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN the amount is exposed as a string that exactly represents the value, with no precision loss

### Requirement: SEM-08 — The endpoint requires a valid api key and an authenticated session, for both clients

`GET /api/resumen/semaforo` MUST be guarded by the same api-key + session layering as
`GET /api/resumen` (`api-access-control` AC-06) — a valid `x-api-key` is necessary but not
sufficient; an active session (cookie or `Authorization: Bearer`) is also required. This spec does
not modify `api-access-control` itself (out of scope, per the proposal); it states the same
contract already governing every other data endpoint applies unchanged to this new one.

#### Scenario: A request with a valid api-key but no session is rejected

- GIVEN a request to `GET /api/resumen/semaforo?periodo=<period>` with a valid `x-api-key` but no
  session cookie and no `Authorization: Bearer` header
- WHEN the request is processed
- THEN the response status is 401

#### Scenario: A request with a valid api-key and a valid session succeeds

- GIVEN a request with a valid `x-api-key` and a valid, unexpired, non-revoked session (cookie or
  Bearer)
- WHEN it calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN the response status is 200

### Requirement: SEM-09 — Absent `periodo` defaults to the latest period with data; a malformed `periodo` is rejected, mirroring `/api/resumen`

WHEN `periodo` is absent from the query, the endpoint MUST default to the user's latest period
with at least one transaction, labelled with the user's cut-off day (perfil-presupuesto PPR-07); the
period in progress is the fallback only when the user has no transaction at all, identically to
`GET /api/resumen`. WHEN `periodo` is present but does not match the domain's
`YYYY-MM` format rule, the endpoint MUST reject the request with a 400 response carrying a
scrubbed message (never reflecting the raw invalid input), identically to `GET /api/resumen`'s
existing rule.

#### Scenario: Absent `periodo` defaults to the latest period with data

- GIVEN a user whose latest transaction falls in period `2026-08`
- WHEN they call `GET /api/resumen/semaforo` with no `periodo` query param
- THEN the response's period is `2026-08`

#### Scenario: A malformed `periodo` is rejected with a scrubbed 400

- GIVEN a client calls `GET /api/resumen/semaforo?periodo=not-a-date`
- WHEN the request is processed
- THEN the response status is 400
- AND the response message does not echo the raw invalid input value

### Requirement: SEM-10 — Every Amarillo/Rojo bucket's advice carries a backend-generated Spanish `mensaje` with a single `{monto}` placeholder, substituted client-side (design D-05)

Every spend bucket's advice object (SEM-03) MUST include a `mensaje`: a complete,
backend-generated Spanish sentence containing the literal placeholder token `{monto}` EXACTLY
ONCE, and no other placeholder. The client substitutes `{monto}` with the CLP-formatted advice
amount (SEM-03's amount) using the SAME single-sourced CLP formatter already used elsewhere in the
web app — money formatting MUST NOT be duplicated server-side. A bucket with no advice (Verde, or
`estadoSemaforo` null) MUST NOT expose a `mensaje`.

#### Scenario: An Amarillo/Rojo bucket's mensaje contains the placeholder exactly once

- GIVEN a period where Necesidades' `estadoSemaforo` is Rojo
- WHEN a client calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN Necesidades' advice `mensaje` is a Spanish sentence containing the literal token `{monto}`
  exactly once
- AND the client substitutes `{monto}` with the CLP-formatted advice amount before rendering

### Requirement: SEM-11 — The semáforo follows the cut-off day and rule 1 (issue #111)

The period MUST be the financial month of perfil-presupuesto PPR-07 (this endpoint carries no date
fields). Percentages, zones and the advised amounts MUST use the base of PPR-08: `totalIngreso` is
the base used, `fuenteIngreso` names its source (`declarado` | `detectado`) and `ingresoDetectado`
is the sum of the period's income credits. A period without any movement stays `sinIngreso`
(SEM-06) even with a declared income.

#### Scenario: The semáforo measures against the declared income

- GIVEN a user with `ingresoDeclarado` `"2000000"`, income credits of 1000000 and a Necesidades
  spend of 500000 in the period
- WHEN they call `GET /api/resumen/semaforo?periodo=<period>`
- THEN `totalIngreso` is `"2000000"`, `fuenteIngreso` is `declarado`, `ingresoDetectado` is
  `"1000000"` and Necesidades is 2500 basis points
