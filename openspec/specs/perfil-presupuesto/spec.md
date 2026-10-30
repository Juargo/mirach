# Perfil Presupuesto Specification

## Purpose

The user's budget profile (issue #110, PER-03..PER-06, ADR-004 §8, ADR-005 §7): a predefined
profile or a custom one, with three targets in basis points that sum 10000. The summaries measure
every month against the current profile. The same resource carries the financial month (issue #111,
PER-02, PER-08): the cut-off day that defines every monthly period and the declared monthly income
used as the base of the percentages. Requirement family `PPR-*`.

## Requirements

### Requirement: PPR-01 — Read the profile

`GET /api/perfil/presupuesto` MUST return the session user's profile as
`{ perfil, metas: { Necesidades, Deseos, Ahorro }, diaCorte, ingresoDeclarado }`, targets in basis
points. A user who never chose a profile MUST get `50_30_20` with `5000`/`3000`/`2000`, `diaCorte`
`1` and `ingresoDeclarado` `null`. It never returns 404.

#### Scenario: Default profile

- GIVEN a user who never chose a profile
- WHEN they call `GET /api/perfil/presupuesto`
- THEN the body is `{ "perfil": "50_30_20", "metas": { "Necesidades": 5000, "Deseos": 3000, "Ahorro": 2000 }, "diaCorte": 1, "ingresoDeclarado": null }`

### Requirement: PPR-02 — Predefined profiles

`PUT /api/perfil/presupuesto` MUST accept `{ "perfil": <id> }` for exactly four predefined ids:
`50_30_20`, `60_20_20`, `70_15_15` and `80_10_10` (shown as «Salir de deudas»; PER-04, no fifth
profile). Their targets are fixed by the id; a body that also sends `metas` is 400 `BODY_INVALIDO`.

### Requirement: PPR-03 — Custom profile

`PUT /api/perfil/presupuesto` MUST accept `{ "perfil": "personalizado", "metas": {...} }` with three
integer targets. Targets that do not sum 10000 MUST return 400 `PERFIL_NO_SUMA_100`; a negative
target MUST return 400 `META_INVALIDA`. In both cases the stored profile MUST NOT change. Until
ADR-012 gates it behind a plan, the custom profile is allowed for every user.

#### Scenario: un perfil personalizado que no suma 100% no se guarda

- Cuando Marcela guarda 60/30/20
- Entonces recibe 400 con código PERFIL_NO_SUMA_100 y su perfil no cambia

### Requirement: PPR-04 — Every month uses the current profile (PER-06)

`GET /api/resumen`, `GET /api/resumen/anual`, `GET /api/resumen/semaforo` and
`GET /api/buckets/{bucket}/detalle` MUST measure every month, past ones too, against the current
profile: `targets` (percentage points), `buckets[].metaBp`, `estado`, `estadoSemaforo` and the
semáforo bands (SEM-02). No monthly total is stored, so nothing is recomputed on write.

#### Scenario: cambiar a "Salir de deudas" recalcula todos los meses

- Dado que Marcela tiene perfil 50/30/20 y movimientos en septiembre y octubre
- Cuando cambia su perfil a 80/10/10
- Entonces el resumen de septiembre y de octubre muestra metas 80%, 10% y 10%

### Requirement: PPR-05 — Isolation

The profile MUST be read and written only for the session user (`userId` from the session, never
from the body; the body schema is strict). A user's `PUT` MUST NOT change another user's profile
or summaries.

### Requirement: PPR-06 — Cut-off day and declared income (issue #111, PER-02, PER-08)

`PUT /api/perfil/presupuesto` MUST accept two optional fields next to `perfil` (and `metas`):

- `diaCorte`: an integer from 1 to 28. The default is `1` (the calendar month). An integer outside
  1–28 MUST return 400 `DIA_CORTE_INVALIDO`; a value that is not an integer is 400 `BODY_INVALIDO`.
- `ingresoDeclarado`: the declared monthly net income in CLP, a positive decimal string of at most
  18 digits (never a JSON number), or `null`. `"0"` MUST return 400 `INGRESO_DECLARADO_INVALIDO`;
  a string that is not 1–18 digits (negative, decimal, longer) is 400 `BODY_INVALIDO`.

Leaving a field out MUST keep its stored value, so a client that only sends `perfil` (and `metas`)
does not reset them. `ingresoDeclarado: null` MUST clear the declared income. On any 400 the stored
profile, cut-off day and declared income MUST NOT change. Both values are editable at any time and
the `PUT` response carries the same shape as `GET`.

#### Scenario: Omitting the financial month keeps it

- GIVEN a user with `diaCorte` 25 and `ingresoDeclarado` `"2000000"`
- WHEN they call `PUT /api/perfil/presupuesto` with `{ "perfil": "60_20_20" }`
- THEN the response carries `diaCorte` 25 and `ingresoDeclarado` `"2000000"`

#### Scenario: null clears the declared income

- GIVEN a user with `ingresoDeclarado` `"2000000"`
- WHEN they call `PUT /api/perfil/presupuesto` with `{ "perfil": "50_30_20", "ingresoDeclarado": null }`
- THEN the response carries `ingresoDeclarado` `null`

#### Scenario: A cut-off day outside 1–28 is rejected

- WHEN a user calls `PUT /api/perfil/presupuesto` with `{ "perfil": "50_30_20", "diaCorte": 29 }`
- THEN the response is 400 with code `DIA_CORTE_INVALIDO` and the stored values do not change

#### Scenario: A non-positive declared income is rejected

- WHEN a user calls `PUT /api/perfil/presupuesto` with `{ "perfil": "50_30_20", "ingresoDeclarado": "0" }`
- THEN the response is 400 with code `INGRESO_DECLARADO_INVALIDO` and the stored values do not change

### Requirement: PPR-07 — The cut-off day defines every monthly period (issue #111)

Every monthly read (`/api/resumen`, `/api/resumen/anual`, `/api/resumen/semaforo`,
`/api/buckets/{bucket}/detalle`, `/api/buckets/{bucket}`, `/api/ingresos/mes`, `/api/movimientos`
and `/api/periodos`) MUST resolve its period with the session user's current cut-off day, in the
domain. The period `YYYY-MM` is the one that STARTS on the cut-off day of that month and ends the
day before the cut-off day of the next month (cut-off 25: `2026-10` = 25 oct – 24 nov). With
cut-off 1 it is exactly the calendar month. Changing the cut-off day recalculates every month,
past ones too; nothing is stored per period.

Tolerance: when the cut-off day is not 1, a credit classified as income counts in a period from
3 days before its start up to 3 days before its end, so a salary paid up to 3 days early counts in
the period it pays for. Every other movement uses the period's own dates. With cut-off 1 there is no
tolerance.

`/api/resumen` (and each month of `/api/resumen/anual`), `/api/buckets/{bucket}/detalle` and
`/api/ingresos/mes` MUST return `fechaInicio` and `fechaFin` (`YYYY-MM-DD`, both inclusive);
`/api/periodos` MUST return `rangos: [{ periodo, fechaInicio, fechaFin }]` in the same order as
`periodos`.

#### Scenario: un sueldo abonado antes del corte cuenta en el período que empieza

- Dado un corte el día 25 y un sueldo abonado el viernes 23 de octubre
- Cuando Marcela abre el período 25 oct – 24 nov
- Entonces el sueldo cuenta como ingreso de ese período

#### Scenario: cambiar el corte cambia todos los períodos

- Dado un corte el día 1
- Cuando Marcela cambia el corte al día 25
- Entonces todos los períodos se muestran del 25 al 24

### Requirement: PPR-08 — The declared income is the base of the percentages (rule 1, VIS-10)

`/api/resumen` (and each month of `/api/resumen/anual`), `/api/resumen/semaforo` and
`/api/buckets/{bucket}/detalle` MUST compute the bucket percentages over the declared income when
the user has one, and over the sum of the period's credits classified as income otherwise. They
MUST expose `fuenteIngreso` (`declarado` | `detectado`). `/api/resumen`, its annual months and
`/api/resumen/semaforo` MUST also expose `ingresoDetectado` (the detected sum, whatever the
source), and their `totalIngreso` MUST be the base used. A period without any movement MUST ignore
the declared income and stay `sinIngreso` (`totalIngreso` `0`, `fuenteIngreso` `detectado`), so an
empty month never shows a verdict. `/api/ingresos/mes` keeps the detected total.

#### Scenario: Percentages over the declared income

- GIVEN a user with `ingresoDeclarado` `"2000000"`, income credits of 1000000 and Necesidades
  spend of 500000 in the period
- WHEN they call `GET /api/resumen?periodo=<period>`
- THEN `totalIngreso` is `"2000000"`, `fuenteIngreso` is `declarado`, `ingresoDetectado` is
  `"1000000"` and Necesidades is 2500 basis points

#### Scenario: A month without movements stays without income

- GIVEN a user with `ingresoDeclarado` `"2000000"` and no movement in the period
- WHEN they call `GET /api/resumen?periodo=<period>`
- THEN `sinIngreso` is true, `totalIngreso` is `"0"` and `fuenteIngreso` is `detectado`
