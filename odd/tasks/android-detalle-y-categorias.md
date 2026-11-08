# Android — bucket detail with reclassify, and categories with patterns

Objective: port iOS `Features/DetalleBucket` and `Features/Categorias` to Android, including classification learning (screens 09, 28, 30). Branch `feat/android-detalle-bucket-api` (first slice). Delivery: chained PRs, stacked to main, one per unit (the user's cached choice). Test runner: `./gradlew :app:testDebugUnitTest` from `apps/android`; CI runs `./gradlew testDebugUnitTest assembleDebug lint --no-daemon`.

## Specs

- **S1 — API facade.** `MirachApi` (and `GeneratedMirachApi`, mappers, models, `FakeMirachApi`) gains the calls the two iOS features use, all already generated in `DefaultApi.kt`:
  - `GET /api/buckets/{bucket}/detalle?periodo` (not `GET /api/buckets/{bucket}`);
  - `PATCH /api/transacciones/{id}/categoria` with optional `aplicarAParecidos: {periodo}`, answering `movidos`;
  - `GET /api/transacciones/{id}/parecidos?categoriaId&periodo`;
  - `PATCH` and `DELETE /api/categorias/{id}`;
  - `POST /api/patrones` with optional `moverDelPeriodo` (201 with `movidos`; 409 with `existente`), `PATCH /api/patrones/{id}` (text, or `categoriaId` to move it), `DELETE /api/patrones/{id}`, `POST /api/patrones/vista-previa`.
  - Errors map the same documented codes iOS maps (`apps/ios/Mirach/Core/API/OpenAPIMirachAPI+BucketDetalle.swift`, `+Categorias.swift`).
  - `CategoriaCatalogo` keeps working for Subir cartola; the categories screens get `esInterna`, `patrones` and `transaccionesCount`.
- **S2 — Bucket detail (port of iOS `DetalleBucket`).** Tapping a bucket in Resumen opens its movements for Resumen's month, grouped by category, with the iOS copy verbatim (loading, error + «Reintentar», «Sin movimientos en {mes}», «Meta: x%», rows «{d mmm} · {origen}»). Back returns to Resumen. A reclassification reloads Resumen.
- **S3 — Reclassify sheet (Figma 09, CLA-03; spec `odd/tasks/aprendizaje-clasificacion.md` S6, S7 and L23).** "que siempre pida Guardar, como en Figma":
  - Picking a category only selects it; nothing is sent until «Guardar», which is disabled until a category is picked. Picking the movement's current category clears the selection.
  - After a pick the sheet asks `parecidos` with the screen's periodo. With a non-null `patron` it shows the checkbox «Aplicar a “{texto}”» (off) with the subtitle «{N} movimientos más y los próximos que lleguen» («Los próximos que lleguen» with N = 0, «1 movimiento más…» with N = 1), and «Ya está en {categoría}: se moverá aquí.» when the text lives in another category. A failed lookup only hides the checkbox.
  - Another bucket: «Guardar» shows «Cambiar de grupo» («Este movimiento pasará de {A} a {B} y cambiará el cálculo del mes.»), «Cancelar» keeps the sheet and its selection and checkbox, «Confirmar» saves honoring the checkbox.
  - A category created from the sheet comes back selected and waits for «Guardar».
  - The announcement reads «Movida a {Bucket} · {Categoria}», plus « · {N} movidos» when N > 0. Error notices are the iOS ones.
- **S4 — Categories tab (port of iOS `Categorias`).** A «Categorías» tab between Subir and Perfil: list («N movimientos · N patrones»), empty state, create, and the category detail (name, group with its confirmation, patterns, delete with its confirmation, discard-changes confirmation), with the iOS copy verbatim.
- **S5 — Pattern sheet and conflict (Figma 28, 30, CLA-15, CLA-17).** As iOS (spec S7 and L15-L18):
  - Field «Texto que aparece en la cartola»; no match-type picker; preview debounced 350 ms, sent without `periodo`: «Coincide con {N} movimientos de {mes}», rows «{descripción} · {d mmm} · {monto}».
  - Checkbox «Mover también estos {N} movimientos a {categoría}» (off; hidden with N = 0, a conflict or a failed preview) with the note «Los que cambiaste a mano no se mueven. Las próximas cartolas usan el patrón siempre.»; «Guardar patrón» sends `moverDelPeriodo` only for the previewed text and month.
  - Conflict in another category: ««{texto}» ya está en {categoría} ({bloque})», «Un texto solo puede estar en una categoría.», «Si lo mueves aquí, los próximos movimientos con «{texto}» contarán como {bloque en minúscula}.», «Moverlo a {categoría} ({bloque})» / «Cancelar».
  - Editing a pattern sends only its text.

## Tasks

- [x] T1 — S1 — inline (shared dependency of T2 and T3; no writer reason) — RED: `DetalleCategoriasApiTest` did not compile (128 errors); GREEN: `./gradlew testDebugUnitTest assembleDebug lint` exit 0; mutation (`moverDelPeriodo = null`) turned 1 of 23 red
- [x] T1b — icons + shared sheet parts + `Format.monthName` (prep for T2/T3) — inline — `feac235c` — RED: `CategoryIconTest` did not compile; GREEN: CI command exit 0
- [x] T2 — S2, S3 — delegated writer (Writer trigger (a): T2 and T3 are independent units with disjoint surfaces, each well over 100 lines, launched together) — worktree `/Users/jorge/dev/mirach-worktrees/android-t2`, branch `feat/android-detalle-bucket` — `35917bad` (PR #219) — RED: 45 tests did not compile; GREEN: CI command exit 0, 476 tests; mutation (apply-to-similar condition) red
- [x] T3 — S4, S5 — delegated writer (same trigger) — worktree `/Users/jorge/dev/mirach-worktrees/android-t3`, branch `feat/android-categorias` — `752cc6ef` (PR #220) — RED: 96 tests did not compile (413 errors); GREEN: CI command exit 0; 5 mutations red; seam check with T2: 572 tests, 0 failed
- [x] V — independent verifier (high-risk item 1: the client decides when stored rows move): S1–S5 PASS, no blockers (L10)
- [x] T4 — wiring: Resumen → bucket detail, «Categorías» tab, bucket group → category detail, catalog refresh across tabs — inline (shared `RootRoute.kt`)

## Log

- L1 (2026-11-07): "Android todavía no tiene las pantallas de aprendizaje de clasificación. ¿Arrancamos con eso?" → "si". Android has neither host screen (bucket detail nor categories), so the options were 09 first, 28/30 first, or both → "3".
- L2: Mapping (explorer):
  - Android has no navigation-compose; sub-screens are a `rememberSaveable` opening id plus a keyed `viewModel(...)` (`SubirCartolaRoute.kt:92-101`).
  - Tabs are wired in `RootRoute.kt:120-140`; `SignedInShell.kt` has labels only (no icon set).
  - Resumen's `BucketRow` (`ResumenComponents.kt:240-282`) has no click.
  - `MirachApi` has only `categorias()`, `crearCategoria()` and `periodos()` of the 12 calls needed.
  - `CategorySheet` and `NewCategoryForm` are private in `features/subircartola/ReviewScreen.kt:307-511`.
  - There is no icon mapping on Android, and `Format` has no month-name-only formatter.
  - Tests: JVM unit tests with JUnit4, coroutines-test, MockWebServer and `testing/FakeMirachApi.kt`; no Compose UI tests.
- L3: Forecast is about 3,000 authored lines, so the work goes in chained PRs: T1 (facade), T2 (bucket detail), T3 (categories), and T3 may split further.
- L4 (T1): Every new call follows the iOS adapter.
  - `CategoriaCatalogo` gains `transaccionesCount`, `esInterna` and `patrones` with defaults, so Subir cartola is unchanged. `GET /api/categorias` and `POST /api/categorias` now fill them; two existing expectations in `CategoriasConsentimientosApiTest` were updated for the count.
  - `PatronCategoria.matchType` stays the server's raw string (no picker; L18 of aprendizaje-clasificacion).
  - The 409 `PATRON_DUPLICADO` reads `existente` from the error body into `PatronException.DuplicateOf`.
  - `categoriaFailure` (shared with `crearCategoria`) is unchanged.
- L5 (2026-11-07): Icons. The options were no icons, own vector drawables, or `material-icons-extended`. The user chose "2".
  - The allowlist values are Lucide names, so the drawables are converted from `lucide-static@0.460.0` (ISC).
  - `CategoryIcon` (`core/design/CategoryIcon.kt`) uses the same labels as iOS.
- L6: Parallel writers work in separate worktrees, not in the shared tree. Both units build the same Gradle module, so a half-written file of one would break the other's compile. `RootRoute.kt` belongs to the parent (T4).
- L7 (T2, writer): The sheet and form are generalized into `features/categoriasheet/CategorySheet.kt`, and Subir cartola uses them with unchanged behavior and tests.
  - *Assumptions:* back reads «Volver»; the «Guardar» hint is a `stateDescription`; the checkbox reads «Marcado»/«Sin marcar».
  - `BucketRow` is clickable only when `ResumenRoute` gets a detail factory.
- L8 (T3, writer):
  - *Assumptions:* deleting a pattern is a text button «Eliminar» (no trash drawable); the system-category notice is prefixed «🔒 »; «Nueva categoría» is a «+» icon button.
  - `CategoriasMessages.movements` and `DetalleBucketMessages.movements` are the same one-line plural, kept per feature (copy, not shared state).
- L9 (T4): Wiring in `RootRoute.kt`.
  - Tabs: Resumen, Subir, Categorías, Perfil (as iOS).
  - A catalog change (Categorías or a category detail) bumps `catalogRevision`. That reloads Resumen, calls Subir's `catalogDidChange()`, and refreshes an open bucket detail through `ResumenRoute(catalogRevision)`; the revision the detail last saw is saved with its opening.
  - A reclassification bumps only `categoriasRevision`, because Resumen already refreshes itself.
  - A group header in the bucket detail opens `DetalleCategoriaRoute` inside the Resumen tab; a `SaveableStateHolder` keeps the open bucket detail under it.
  - *Limitation:* a category created from the reclassify sheet without saving does not refresh Subir or Categorías until the next catalog change or reclassification.
  - No Compose UI tests exist, so the wiring was checked by the CI build and by reading.
- L10 (2026-11-07): Independent verifier, baseline 679f0d76, candidate 835fff60.
  - S1–S5 PASS, no blockers. CI exit 0.
  - 24 probes pass. Two mutations (the previewed-text guard, and `takeIf { applyToSimilar }`) turned them red.
  - Android sends `aplicarAParecidos` with the periodo `parecidos` answered for, which is stricter than iOS (iOS uses the screen periodo at save time).
  - Subir cartola is unchanged after the sheet extraction.
  - The probes are committed as `ReclassifyApplyRegressionTest` and `PatternMoveRegressionTest`. CI exit 0, 596 tests.
  - Advisories:
    - A new pattern text whose preview has the same total and month keeps the checkbox marked (same as iOS).
    - The L9 limitation.
    - No Compose UI tests.

