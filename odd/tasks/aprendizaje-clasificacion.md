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

- [x] T1 — S1, S2, S5 (domain + dedupe) — delegated writer — `3970e78f` — RED: specs failed on missing modules and on `existente`; GREEN: `npx vitest run` 3501 passed
- [x] T2 — S3 (preview endpoint) — delegated writer — `24d191dd` — RED: route/mapper specs 6 failed; GREEN: 3501 passed
- [x] T3 — S4, S5 (create with move, 409 detail, move pattern) — delegated writer — `ae57da2b` — RED: use case 4 + 3 failed, routes failed; GREEN: unit 3522 passed, `aprendizaje-clasificacion.int-spec.ts` 5 passed; mutation (no `$transaction`) turned the rollback test red
- [x] T4 — S6 (similar suggestion + reclassify with apply) — delegated writer — `f91f070e` — RED: 2 use case specs + 9 route tests failed; GREEN: unit 3545 passed, int spec 8 passed
- [x] T5 — regenerate iOS and Android clients; Android compiles — delegated writer — `f6eb4398` — iOS `xcodebuild build` and `build-for-testing` exit 0; Android `:app:compileDebugKotlin` exit 0; int 273 passed, e2e 145 passed
- [x] T6 — S6, S7 (iOS 09, 28, 30) — delegated writer — `f1688fbd` — RED: with compile-only skeletons, 25 tests failed (47 issues) of 654, including 3 existing API fixtures without `movidos` (T5 left them red); GREEN: `xcodebuild test -only-testing:MirachTests` 654 passed
- [x] V — independent verifier (high-risk item 1: moving stored rows): S1–S7 PASS, no blockers (L21).

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
- L5 (T1): "Coincide" is exact: the candidate gets a marker category inside the simulated catalog, so a row counts only when the engine picks the candidate itself (not just "lands in the target category"). If the text already exists (folded), the candidate replaces that pattern and keeps its id, match type and `creadoEn`, so the preview models "move it here". A new pattern loses CLA-12 ties (it is the newest).
- L6 (T1): `existePatron` was replaced by `buscarPorTexto` (returns the existing pattern with category and bucket). It folds accents in memory over the user's patterns (userId in the WHERE). `POST /api/categorias` with nested `patrones` now also folds accents, both against the catalog and inside the batch.
- L7 (T2): Preview `patron` is returned as the engine compares it (`normalizarTextoPatron`). `monto` is `cargo` as a string (incomes never coincide). Coincidences are ordered by fecha asc, id asc. Catalog read failure → 503 `CATALOGO_NO_DISPONIBLE`; invalid periodo → 400 `PERIODO_INVALIDO` (new codes in `aCatalogoHttpError`).
- L8 (T3): One interactive `$transaction` in `PrismaAprendizajeClasificacionWriter` does category lookup `(id, userId)` → optional manual reclassification → pattern (create/move/keep) → move rows. The coinciding ids are selected before the transaction; the move's WHERE repeats `account.userId` and `clasificacionManual = false`, so a row changed by hand in between is not overwritten. `movidos` is Prisma's count.
- L9 (T3): `POST /api/patrones` 201 is now `PatronCreateResponse` (the previous `PatronResponse` fields plus `movidos`). The 409 adds `existente`. `PATCH /api/patrones/{id}` accepts `categoriaId` (404 `CATEGORIA_NO_ENCONTRADA`, 403 `CATEGORIA_INTERNA`); moving a pattern moves no movements. Assumption: `moverDelPeriodo` must be an explicit YYYY-MM (no default).
- L10 (T4): `GET /api/transacciones/{id}/parecidos` returns `patron: null, total: 0` both when the glosa leaves fewer than 3 letters and when the target category is internal (assumption: "Desconocido" holds no patterns, so there is nothing to offer, instead of a 403 the sheet would have to handle). Missing `categoriaId` → 400 `PARAMETROS_INVALIDOS`; foreign movement → 404 `TRANSACCION_NO_ENCONTRADA`; foreign category → 404 `CATEGORIA_NO_ENCONTRADA`.
- L11 (T4): `PATCH /api/transacciones/{id}/categoria` always returns `movidos` (0 without `aplicarAParecidos`, same as `POST /api/patrones`). With `aplicarAParecidos` the body is validated at the route (malformed → 400 `BODY_INVALIDO`, never ignored); an unknown category and a foreign movement keep the plain PATCH's 400/404 bodies; internal category → 403 `CATEGORIA_INTERNA`; no suggestion → 400 `PATRON_INVALIDO` (assumption: refuse rather than silently reclassify only). The pattern is created, moved (CLA-17, same id) or kept; OTHER coinciding rows move.
- L12 (T5): Minimal iOS mapping edits only: `POST /api/patrones` 201 decodes `PatronCreateResponse` (an overload of `mapped`), and the new documented 403/503 cases of create, PATCH pattern and PATCH reclassify are handled (those calls never send the new options). Android compiled with the regenerated client unchanged. Docs updated: `docs/catalogo/flujos/categorias-y-patrones.md`, `inicio-y-movimientos.md`, and gap 16 moved to "Cerradas" in `docs/catalogo/README.md` (iOS screens still pending, T6).
- L13 (T6): Screen 09 keeps the immediate move when there is nothing to offer: after choosing a category the sheet asks `parecidos` for the screen's own periodo; with a non-null `patron` it shows «Aplicar a “…”» (off) and a «Guardar» button pinned under the list, otherwise (null `patron`, or the lookup failed) it reclassifies at once as before. A bucket change still asks first and carries the checkbox through the confirmation. Choosing another tile re-asks and turns the checkbox off.
- L14 (T6): *Assumption:* the announcement after saving appends « · {movidos} movidos» when movidos > 0, on 09 («Movida a Gustos · Restaurantes · 2 movidos») and on 28 («Patrón guardado · 3 movidos»).
- L15 (T6): Screen 28's periodo: the categories screen has no month, so the preview is sent WITHOUT `periodo` and the API resolves the latest month with data (the same default `GET /api/resumen` uses when the Resumen opens without a month). `moverDelPeriodo` is the `periodo` that preview answered, so the move and the list the person saw are the same month. The preview is debounced 350 ms (a task keyed by the text). The checkbox is off by default (CLA-15 "si la persona no lo marca") and hidden when N = 0 or when there is a conflict; a failed preview only hides it and saving then sends no `moverDelPeriodo`.
- L16 (T6): *Assumption:* with N = 1 the copy reads «Coincide con 1 movimiento de {mes}» and «Mover también este movimiento a {categoría}» (singular). Rows use `Format.expense`, so the sign is an ASCII hyphen («-$32.400»), as in every other list, not Figma's «−».
- L17 (T6): Screen 30 appears when the preview's `existente` or the 409's `existente` is in ANOTHER category; in the same category the 409 keeps «Ya tienes un patrón con ese texto». «Moverlo a …» PATCHes `existente.patronId` with this `categoriaId` and lists the pattern here; «Cancelar» closes the sheet. The texto shown is the one typed (trimmed). A 404 on that PATCH clears the conflict and says the pattern no longer exists.
- L18 (T6): Editing a pattern sends only the text (`PatronCambios(patron:)`); the pattern keeps its own match type, including ones the app does not know. `MatchType.selectable`/`options(including:)` went with the picker.
- L19 (T6): Protocol design: `MirachAPI` gained `crearPatron(categoriaId:patron:moverDelPeriodo:)`, `vistaPreviaPatron`, `parecidos` and `reclasificar(…aplicarAParecidos:)`; `PatronCambios` gained `categoriaId`; `PatronError.duplicateOf(PatronExistente)`. A protocol extension gives fallbacks so `StubMirachAPI` (apps/ios/Mirach/App, outside T6's edit surface) still compiles: plain calls delegate, the learning calls throw 501, which the screens show as "nothing to offer". Limitation: the reclassify 400 has no documented body, so a `PATRON_INVALIDO` with `aplicarAParecidos` would read as "Esa categoría ya no existe" (the app only applies a suggestion the API made).
- L20 (T6): Pending outside T6's surface: `MirachUITests.swift:1084-1092` taps `pattern.type.REGEX`/`STARTS_WITH`, which no longer exist, so that UI test must be updated (it was not run). The UI-test stub does not implement the new endpoints.

- L21 (2026-11-06): Independent verifier, baseline 8827a468:
  - S1–S6 PASS on live local-DB probes, including:
    - a longer pattern wins over the candidate;
    - a forced failure mid-transaction leaves nothing changed;
    - user B is never touched;
    - rejections leave the row hash unchanged.
  - S7 PASS on code reading.
  - The contract diff is additive only.
  - Behavior change reported: POST /api/categorias with nested patterns now folds accents in its duplicate check (consistent with CLA-17).
  - Advisories:
    - S1 can suggest generic texts such as «compra tarjeta debito»; the count is shown first.
    - An iOS race on screen 28: saving within the 350 ms debounce sent `moverDelPeriodo` for a text that was never previewed. Fixed by the parent: the move only goes with the previewed text. RED/GREEN in `savingATextOtherThanThePreviewedOneMovesNothing`, and MirachTests 655/655.
- L22: The parent rewrote the UI test that tapped the removed type picker (62c06704). It now passes.
- L23 (2026-11-06): The user decided, verbatim: "que siempre pida Guardar, como en Figma". L13 is superseded:
  - Screen 09 always works as select-then-«Guardar». Picking a category only selects it (highlighted); nothing is sent until «Guardar» (`detalle.saveCategory`), which is disabled until a category is picked.
  - «Aplicar a “…”» still appears only when `parecidos` returns a `patron`; a failed lookup only hides it and never blocks «Guardar».
  - Another bucket: «Cambiar de grupo» now shows on «Guardar». «Cancelar» keeps the sheet, the selection and the checkbox; «Confirmar» saves, honoring the checkbox.
  - Picking the category the movement already has clears the selection (nothing to save) instead of closing the sheet. A category created from the sheet comes back selected and waits for «Guardar».
  - The highlight is the shared `CategorySheet`'s checkmark and `isSelected` trait; Figma's dark tile border was not added because `CategorySheet` (SubirCartola/ReviewView.swift) is shared with the statement review and outside this change.
- L24: Slices, chained to main:
  - #213 A, `feat/api-aprendizaje-dominio`: T1, plus the docs commits.
  - #214 B, `feat/api-aprendizaje-contrato`: T2–T5. About 3,600 authored lines, so `size:exception`. Every endpoint commit changes `openapi.json`, and CI needs the regenerated clients with it, so B cannot split further and stay green.
  - #215 C, `feat/ios-aprendizaje-clasificacion`: T6 plus the follow-ups. About 1,670 authored lines, so `size:exception`.
  - No migration is needed.
- L25 (2026-11-06): #214 had `ios checks` red because three iOS API fixtures lacked `movidos` (fixed only in #215). The fix moved to #214 (410fd177; MirachTests 620/620 locally), and #214 was merged into #215 (0cc1746a), so each PR is green by itself.
