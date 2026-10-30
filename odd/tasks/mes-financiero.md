# Mes financiero e ingreso declarado (#111)

Objective: a per-user cut-off day defines every monthly period, and percentages use the declared monthly income when there is one. Branch `feat/mes-financiero` from `main` (3a7d066).
Delivery: `single-pr` with work-unit commits (same as #110). Test runner: vitest (`pnpm api test`, `pnpm api test:integration`, `pnpm api test:e2e --no-file-parallelism`).

## Specs

- **S1** Profile resource. Issue #111: "Día de corte de 1 a 28 (por defecto 1) e ingreso mensual declarado en el recurso de perfil de presupuesto." ADR-005 §7: "En el mismo recurso". PER-02: "El valor es editable en cualquier momento". Assumption: `PUT /api/perfil/presupuesto` takes `diaCorte` and `ingresoDeclarado` as optional fields; leaving one out keeps it unchanged, and `ingresoDeclarado: null` clears it. This keeps current clients compatible.
- **S2** Period in the domain. "El período se resuelve en el dominio: `25 sep – 24 oct` para corte 25." PER-08: "Por defecto es el mes calendario. La persona elige un día entre el 1 y el 28." Decision L2: `periodo=YYYY-MM` names the month in which the period STARTS (corte 25: `2026-10` = 25 oct – 24 nov).
- **S3** Tolerance. "Tolerancia: un abono clasificado como ingreso que llega hasta 3 días antes del corte cuenta en el período que empieza." Decision L3: it applies only when the cut-off day is not 1, so the calendar month stays exactly as today. Acceptance: "Dado un corte el día 25 y un sueldo abonado el viernes 23 de octubre Cuando Marcela abre el período 25 oct – 24 nov Entonces el sueldo cuenta como ingreso de ese período".
- **S4** Endpoints. "`/resumen`, `/resumen/anual`, `/buckets/{bucket}/detalle`, `/ingresos/mes` y `/periodos` respetan el período; la respuesta incluye fecha de inicio y fin." Acceptance: "Dado un corte el día 1 Cuando Marcela cambia el corte al día 25 Entonces todos los períodos se muestran del 25 al 24".
- **S5** Rule 1 and VIS-10. "Regla 1: los porcentajes se calculan sobre el ingreso declarado; sin él, sobre la suma de abonos de ingreso. La respuesta indica cuál se usó (VIS-10)."
- **S6** Done (ADR-010 §7): "escenarios de aceptación pasan · prueba en la capa más baja posible · test de aislamiento si toca datos de usuario · si cambia el contrato: `openapi:emit`, ambos clientes regenerados y `oasdiff` sin cambios incompatibles · CI en verde y revisión de seguridad del PR · logs sin montos ni datos personales."

## Tasks

- [x] T1 S1, S2, S3 — domain: cut-off day, period with cut-off and income window, profile carries cut-off day and declared income. Route: inline. RED observed (missing modules); unit 3283/3283. Commit: 563ba6f (assess: medium, under budget).
- [x] T2 S1 — migration (`User.diaCorte`, `User.ingresoDeclarado`) and repository. Route: inline. Risk: item 1 (migration). RED observed (int suite against unmigrated DB); integration 242/242 after `migrate deploy` on the local test DB. Commit: 9db0d59. Verifier: no blockers (L5). Native review T1+T2: approved, acknowledged (L6).
- [x] T3 S1 — `GET/PUT /api/perfil/presupuesto` with the new fields, e2e. Route: inline. RED observed (5 use-case tests); e2e perfil 25/25 (new fields, keep-on-omit, null clears, 400 DIA_CORTE_INVALIDO / INGRESO_DECLARADO_INVALIDO / BODY_INVALIDO, isolation); keep-on-omit mutation-checked; unit 3288/3288.
- [ ] T4 S2, S3, S4 — use cases and repositories filter by the period (income window for income rows); `/periodos` and `/resumen/anual` follow the cut-off day; responses carry start and end dates. Route: inline.
- [ ] T5 S5 — percentage base from declared income, source field in the responses. Route: inline.
- [ ] T6 S6 — openapi emit, iOS/Android clients, openspec. Route: inline.

## Log

- L1 (2026-10-30) User: "si" to "¿Sigo con #111?" (issue #111 is the request; its text is quoted in S1–S6).
- L2 (2026-10-30) User chose "Mes en que empieza": `?periodo=2026-10` with corte 25 is 25 oct – 24 nov.
- L3 (2026-10-30) User chose "Solo con corte ≠ 1": the income tolerance does not apply to the default calendar month.
- L4 (2026-10-30) Mapping: every monthly use case goes through `resolverPeriodo` + `PeriodoMes` (UTC, `[desde, hasta)`); `/resumen/anual` uses `PeriodoAnio` + `getUTCMonth`; `/periodos` uses SQL `to_char(fecha,'YYYY-MM')`. `/movimientos`, `/buckets/:bucket` and `/resumen/semaforo` share `resolverPeriodo`, so they follow the cut-off day too (ADR-005 §7 names `/movimientos`); only the issue's five endpoints gain date fields. PER-02's suggested income is not in the issue and stays out.
- L5 (2026-10-30) Independent verifier on T1+T2 (9db0d59): no blockers; S1 (persistence), S2, S3 PASS. Migration keeps every existing column byte-identical (md5), CHECKs reject 0/29 and 0/-5, no drift; cut-off 1 matches the baseline `PeriodoMes` for 2000–2999. Advisories: A1 a PUT without the new fields reset them (fixed in T3, tested); A2 an invalid stored goal also dropped a valid financial month (fixed in T3); A3 unit suite fails 8 `seed-catalog.spec.ts` tests when testenv.sh is exported (pre-existing).
- L6 (2026-10-30) Native review T1+T2 (3a7d066..9db0d59, lenses risk + reliability): approved and acknowledged (lineage review-8b861b7e85dde943). Advisories: `guardar` overwrites the financial month (same as A1, fixed in T3); fake timers in `periodo-mes.spec.ts` (already restored by the outer `afterEach`).
