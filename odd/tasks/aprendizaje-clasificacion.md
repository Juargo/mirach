# Classification learning (step 3: CLA-03, CLA-15, CLA-17)

Objective: the person teaches the classifier while reclassifying and while adding patterns, with a preview and an atomic "move this month's" option. API plus iOS; Android comes in step 4 (T11). Branch `feat/api-aprendizaje-clasificacion`. Delivery: chained PRs stacked to main (the user's cached choice). Runners: `npx vitest run` in `apps/api`; iOS `xcodebuild test` on the iPhone 18 Pro simulator.

## Specs

Requirements quoted verbatim from `docs/requisitos/requisitos-funcionales-v1.md`:
- CLA-03: "Reclasificar un movimiento y recordar la decisión" — "La app ofrece aplicar el cambio a movimientos parecidos y lo usa en las próximas cartolas".
- CLA-15: "Vista previa al guardar un patrón" — "La app muestra con cuántos movimientos del mes coincide y pregunta si moverlos. Si la persona no lo marca, el patrón solo se usa en las próximas cartolas."
- CLA-17: "Un mismo texto vive en una sola categoría" — "Si el patrón ya existe en otra categoría, la app lo dice y ofrece moverlo."
- ADR-004:49: "Guardar un patrón y mover los movimientos coincidentes del mes | Una transacción | CLA-15".

- **S1 — Suggested text (CLA-03).** The API derives a CONTAINS text from a glosa:
  - lowercase, without accents;
  - remove payment-gateway prefixes (`merpago*`, `mercadopago*`, `payu *`, `dl*`, `pp*`);
  - remove digits, `*` and stray punctuation, then collapse spaces.
  - Example: «MERPAGO*CABIFY1234 5678» → «cabify».
  - No suggestion when fewer than 3 letters remain.
- **S2 — What "coincide" means (CLA-15, CLA-03).** A movement counts when adding the candidate pattern to the person's catalog would make the engine pick that pattern (CLA-12 longest wins, CLA-14 folding).
  - Excluded: incomes, rows with `clasificacionManual` (CLA-16), and rows already in the target category.
  - Scope: the requested `periodo` (YYYY-MM) under the person's financial month (`PeriodoMes` with the profile's `DiaCorte`).
- **S3 — Preview (CLA-15, CLA-17).** The API answers, for a candidate text, target category and periodo:
  - the coinciding movements (id, descripcion, fecha, monto) and their count;
  - `existente`: the pattern that already holds the text (accent- and case-insensitive), with its category and bucket, or null.
- **S4 — Save with move (CLA-15, ADR-004).** Creating a pattern can carry the periodo to move. Saving the pattern and moving the coinciding rows happen in one transaction. Moved rows keep `clasificacionManual` false. The response says how many moved. Without the periodo, nothing moves: "el patrón solo se usa en las próximas cartolas".
- **S5 — Duplicate and move (CLA-17).**
  - The duplicate check folds accents ("cafe" collides with "café").
  - The 409 `PATRON_DUPLICADO` adds `existente` (additive).
  - A pattern can move to another category (PATCH with `categoriaId`). It keeps its id and `creadoEn` (CLA-12 tie-break). Internal categories still reject (CLA-18).
- **S6 — Reclassify and apply to similar (CLA-03, Figma 09 `89:337`).**
  - Before saving, the sheet asks the API for the suggested text and how many other movements of the periodo would coincide.
  - Saving with "aplicar" does the following in one transaction:
    - reclassifies the movement (manual);
    - creates the pattern in the chosen category, or moves it there if it lives in another one;
    - moves the coinciding rows of the periodo.
- **S7 — iOS screens (Figma, copy verbatim).**
  - **09:** a checkbox «Aplicar a “{texto}”» with the subtitle «{N} movimientos más y los próximos que lleguen».
    - *Assumption:* with N = 0 the subtitle reads «Los próximos que lleguen».
    - *Assumption:* if the text lives in another category, a second line reads «Ya está en {categoría}: se moverá aquí.»
  - **28:** the label «Texto que aparece en la cartola».
    - The preview reads «Coincide con {N} movimientos de {mes}», with rows «{descripción} · {d mmm} · −${monto}».
    - A checkbox «Mover también estos {N} movimientos a {categoría}», with the note «Los que cambiaste a mano no se mueven. Las próximas cartolas usan el patrón siempre.»
    - The button reads «Guardar patrón».
    - There is no match-type picker, and the footer that said "Distingue tildes" goes (CLA-14).
  - **30:** ««{texto}» ya está en {categoría} ({bloque})», «Un texto solo puede estar en una categoría.», «Si lo mueves aquí, los próximos movimientos con «{texto}» contarán como {bloque en minúscula}.»
    - Buttons: «Moverlo a {categoría} ({bloque})» and «Cancelar».

## Tasks

- [ ] T1 — S1, S2, S5 (domain + dedupe) — inline
- [ ] T2 — S3 (preview endpoint) — inline
- [ ] T3 — S4, S5 (create with move, 409 detail, move pattern) — inline
- [ ] T4 — S6 (similar suggestion + reclassify with apply) — inline
- [ ] T5 — regenerate iOS and Android clients; Android compiles — inline
- [ ] T6 — S7 (iOS 09, 28, 30) — inline
- [ ] V — independent verifier (high-risk item 1: moving stored rows)

## Log

- L1 (2026-11-06): "sigamos con el paso 3". The proposal (apply-to-similar through a suggested pattern, month preview with a move checkbox, move a duplicate pattern, defaults: financial month, exclude manual and same-category rows, accent-insensitive duplicates): "sí, avanza con ese diseño".
- L2 (2026-11-06): Figma 09 puts the checkbox inside the reclassify sheet with a non-editable text. "sí, sigue Figma".
- L3: Mapping (explorer):
  - Reevaluate already skips manual rows but has no period filter.
  - `descripcion` is decrypted in memory (`prisma-reevaluar-categorias.reader.ts:58`).
  - The 409 carries no category, and `existePatron` is accent-sensitive.
  - PATCH /api/patrones rejects `categoriaId`.
  - Android has no categories UI.
- L4: Route: inline throughout. API and iOS are dependent (iOS needs the regenerated contract), so no parallel writers. Forecast: ~1,500 authored lines, so chained PRs.
