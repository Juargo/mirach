# API classification engine (CLA-12, CLA-14, CLA-16, CLA-18)

Objective: make the auto-classification engine follow the decided rules before the closed beta. This is step 1 of the classification plan agreed on 2026-11-06. Branch `feat/api-motor-clasificacion`, delivered as chained PRs stacked to main. Test runner: `pnpm api test` (vitest).

## Specs

Requirement text quoted verbatim from `docs/requisitos/requisitos-funcionales-v1.md`.

- **S1 — CLA-14:** "Un patrón coincide si la descripción contiene su texto … No importan las mayúsculas ni las tildes: "uber" encuentra "UBER EATS" y "Uber Trip". … Es el único tipo de patrón: los tipos «empieza con» y «expresión regular» heredados del API no se ofrecen (decidido el 25-10-2026)".
  - Scope: CONTAINS and STARTS_WITH compare after case and accent folding on both sides.
  - REGEX keeps today's comparison: lowercase, with accents kept.
  - *Assumption:* the API still accepts and evaluates the legacy STARTS_WITH and REGEX values. Existing rows are not rewritten, and the contract stays additive (ADR-005). "No se ofrecen" is a client concern.
- **S2 — CLA-12:** "Cuando dos patrones empatan, el desempate es estable … Gana el patrón más largo, por ser el más específico ("uber eats" gana sobre "uber"); si miden igual, gana el más antiguo. … reemplaza la prioridad numérica heredada del API, que la app no muestra ni edita".
  - Scope:
    - The ordering becomes: normalized pattern length descending, then creation date ascending, then pattern text, then id.
    - `prioridad` stops affecting the ordering. It is still accepted and returned.
    - Additive migration: `PatronClasificacion.creadoEn DateTime @default(now())`.
- **S3 — CLA-18:** "\"Desconocido\" no acepta patrones … Es la categoría de lo que no coincide con ningún patrón".
  - Scope: creating a pattern on a category with `esInterna` is rejected with `CategoriaInternaProtegidaError`. That error already maps to 403 `CATEGORIA_INTERNA`.
  - PATCH cannot move a pattern between categories, so only POST needs the guard.
- **S4 — CLA-16:** "Lo que la persona cambió a mano no lo cambia un patrón … Un movimiento reclasificado a mano (MOV-03) no se mueve al crear, editar o borrar patrones".
  - Additive migration: `Transaccion.clasificacionManual Boolean @default(false)`.
  - The flag is set to true by:
    - `PATCH /api/transacciones/:id/categoria`;
    - *assumption:* a row whose category the person chose in the import review (commit overlay);
    - *assumption:* a manual movement created with a category.
  - `POST /api/transacciones/reevaluar` never changes a row with the flag set.
  - Existing rows start as false: past manual changes cannot be recovered.
- **S5 — Delivery and data:** both migrations are additive. Render does not run migrations, so the user applies each one to Supabase before its PR merges (root CLAUDE.md).

## Tasks

- [x] P1 — S1 — inline — 53e74e3d. RED: 4 tests. GREEN: domain, application and persistence tests pass.
- [x] P2 — S2 — inline — 3b0e6109. Migration `20261106000000_add_patron_creado_en`. RED: 3. Mapping checked by mutation.
- [x] P3 — S3 — inline — 08bbe72f. 403 documented. iOS and Android clients regenerated; iOS maps the 403 (17/17 CategoriasAPITests).
- [x] P4 — S4 (PATCH and reevaluate) — inline — d08347f2. Migration `20261106010000_add_transaccion_clasificacion_manual`. Integration test checked by mutation: it fails only when both guards are removed.
- [x] P5 — S4 (review overlay and manual movement) — inline — 80a12959.
- [x] V — independent verifier over P1–P5 (high risk item 1). S1–S5 PASS, no blockers.

## Log

- L1 (2026-11-06): "subido. He decidido que quiero que la app que haré que los testers vean sea uno con la mayoría de los features. En particular tener bien implementada la base de patrones de autoclasificacion." Then: "paso 1".
- L2: Mapping evidence:
  - The ordering is in `categorizar-transaccion.use-case.ts:135-139`. Matching is in `patron-clasificacion.ts:66-91`.
  - Reevaluate overwrites any matched row (`reevaluar-categorias.use-case.ts:30-32`).
  - `PatronClasificacion` has no creation date (`schema.prisma:220-243`).
  - No client code reads `prioridad`; only the generated models do.
- L3: Route: every task is inline. No writer trigger applies: each unit is sequential and small. P4 names high-risk item 1, so it gets an independent verifier.
- L4: Forecast: about 500 authored lines, so chained PRs. Strategy: the user's cached choice, "prs encadenados".
- L5: S1 rewritten:
  - The template's REGEX entries are deliberate. `\bwom\b` and `^transf…ahorro` block false positives, and `catalogo-template-clasificacion.spec.ts:22` pins them.
  - Converting them to CONTAINS without measured data would bring those false positives back.
  - Their replacement moves to step 2, which measures against the user's real statements.
- L6: Checks on 80a12959:
  - Unit: 3438/3438.
  - Integration: 265/265 and e2e: 145/145, both against local Postgres with the new migrations.
  - `openapi:check` is clean.
- L7: P4 was split into P4 and P5 to keep each slice reviewable. The overlay and manual-movement paths went through the persistence mapper separately.
- L8: Independent verifier, 2026-11-06:
  - S1–S5 PASS.
  - Differential run with the real template: 0 of 39 single-pattern glosas changed winner. 612 of 1,521 two-pattern glosas did, all by longest-wins (e.g. "LIDER UBER EATS" → Delivery).
  - Advisories:
    - `backfill-categorias.ts` builds patterns without `creadoEn`. It is a one-off script, so this does not matter.
    - A null overlay (the suggestion was removed) leaves the flag false. Product edge: it fits "category chosen" in S4.
    - Rows reclassified before this change start as false, as S4 already accepts.
- L9: Slices, stacked to main:
  - PR A: P1 and P2 (53e74e3d, 3b0e6109). Needs migration `add_patron_creado_en`.
  - PR B: P3 (08bbe72f).
  - PR C: P4, P5 and docs. Needs migration `add_transaccion_clasificacion_manual`.
