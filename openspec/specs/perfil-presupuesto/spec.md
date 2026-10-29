# Perfil Presupuesto Specification

## Purpose

The user's budget profile (issue #110, PER-03..PER-06, ADR-004 §8, ADR-005 §7): a predefined
profile or a custom one, with three targets in basis points that sum 10000. The summaries measure
every month against the current profile. Requirement family `PPR-*`.

## Requirements

### Requirement: PPR-01 — Read the profile

`GET /api/perfil/presupuesto` MUST return the session user's profile as
`{ perfil, metas: { Necesidades, Deseos, Ahorro } }`, targets in basis points. A user who never
chose a profile MUST get `50_30_20` with `5000`/`3000`/`2000`. It never returns 404.

#### Scenario: Default profile

- GIVEN a user who never chose a profile
- WHEN they call `GET /api/perfil/presupuesto`
- THEN the body is `{ "perfil": "50_30_20", "metas": { "Necesidades": 5000, "Deseos": 3000, "Ahorro": 2000 } }`

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
