# Android: Subir cartola (T6 of `odd/tasks/app-android.md`, issue #134)

Objective: port the iOS "Subir cartola" flow to Android, plus the statement-processing consent (PRI-02) the API already enforces. Branch `feat/android-subir-cartola` (from `main` 2ce1b805). Delivery: work-unit commits, chained PRs (`stacked-to-main`, as in earlier Android tasks). Runner: `cd apps/android && ./gradlew testDebugUnitTest`.

## Specs

- **S1 — Parity with iOS.** Same behavior and Spanish copy as the iOS flow in `apps/ios/Mirach/Features/SubirCartola/` (`SubirCartolaViewModel.swift`, `SubirCartolaPresentation.swift`, `ReviewPresentation.swift`, `NewCategoryForm.swift`): choose a `.pdf` or `.xlsx` file of at most 10 MB; preview; password for a protected PDF (kept only in memory, re-sent on every later call); decision screen ("Subir tal cual", "Revisar y editar", "Descartar" with confirmation); row-by-row review with editable rows only when not a duplicate and not an income (IMP-21); create a category from a row; commit; success with "Ver resumen del mes" and "Subir otra cartola". Error mappings as in `OpenAPIMirachAPI+Ingesta.swift`.
- **S2 — Consent (PRI-02).** The API answers 409 `CONSENTIMIENTO_CARTOLAS_REQUERIDO` without a current `cartolas` consent (`apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts:120`). Before the first upload the app shows the consent screen (Figma 16, node 114:442) and, on "Acepto y continúo", sends `POST /api/consentimientos` `{tipo: "cartolas", version: "2026-11-03"}`. Copy from Figma: title «Antes de tu primera cartola»; body «Para mostrarte tu 50/30/20 necesitamos leer los movimientos de tu cartola. Esto es lo que hacemos con ella.»; list header «Qué hacemos con tu archivo»; items «1. Leemos la fecha, la descripción y el monto de cada movimiento.» «2. Borramos el archivo apenas terminamos de leerlo.» «3. Encriptamos los detalles de tus movimientos.» «4. No pedimos tu clave del banco ni nos conectamos a él.»; buttons «Acepto y continúo» and «Ahora no». *Assumption:* item 5 («Puedes retirar este permiso cuando quieras en Ajustes.») is left out until the app can revoke the consent. A 409 `CONSENTIMIENTO_CARTOLAS_REQUERIDO` during preview or commit returns to the consent screen.
- **S3 — PRI-03 copy.** The initial upload screen states that bank passwords are never asked for and that the file is deleted after processing.
- **S4 — Entry and refresh.** A «Subir» tab between Resumen and Perfil; the Resumen empty state offers the upload; after a commit Resumen reloads and "Ver resumen del mes" selects the Resumen tab. The staged file copy is deleted on discard, after commit and on sign-out.
- **S5 — Out of scope (T6b):** bank guide (IMP-08), share intent (IMP-01 "compartir"), Cartolas subidas list, consent revocation.

User decision (L2): «sí, arranca así» to: "T6 en Android con el consentimiento incluido, y el arreglo de iOS como una tarea aparte después".

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| U1 — API methods, models, typed errors, MockWebServer tests (`previewIngesta`, `commitIngesta`, `categorias`, `crearCategoria`, `consentimientos`, `aceptarConsentimientoCartolas`) | S1, S2 | delegated writer (parallel with U2) | pending | |
| U2 — File picking and staging (ContentResolver copy to cacheDir, pdf/xlsx, 10 MB, discard, purge at launch and sign-out) | S1, S4 | delegated writer (parallel with U1) | done: 16 tests green, purge/discard calls wired in U3/U5 | see git log |
| U3 — `SubirCartolaViewModel`, messages and review presentation, with unit tests | S1, S2, S3 | delegated writer (context backstop) | pending | |
| U4 — Compose screens: consent, upload states, password, decision, review, new category form | S1, S2, S3 | delegated writer (context backstop) | pending | |
| U5 — Shell wiring: «Subir» tab, hoisted tab selection, Resumen reload and empty-state action | S4 | inline | pending | |
| U6 — iOS: consent step and 409 mapping (separate task, after Android) | S2 | — | pending | |

## Log

- **L1** (2026-11-04, user): «sigamos con la carga de cartolas en Android primero»
- **L2** (2026-11-04, user): «sí, arranca así» (scope: Android T6 with consent; iOS fix afterwards as a separate task).
- **L3** (2026-11-04): mapping done. The generated Retrofit client already declares every endpoint needed (`core/api/generated/apis/DefaultApi.kt`). Ingest has no preview id: commit re-sends file, password and `edits` JSON text. Risk to verify in U1: `String` `@Part` through the kotlinx-serialization converter may arrive JSON-quoted. iOS never grants the `cartolas` consent and maps every 409 to the catalog copy (likely live bug, U6).
- **L4** (2026-11-04) correction of L3: enforcement is behind the `exigir` flag of `VerificarConsentimientoCartolasUseCase` (`apps/api/src/application/use-cases/consentimientos.use-case.ts:64-77`), off in production until #134 ships on both apps and is the minimum version (#112 L2). iOS uploads work today; U6 is still required before the flag is turned on.
- **Next:** launch U1 and U2 writers in parallel.
