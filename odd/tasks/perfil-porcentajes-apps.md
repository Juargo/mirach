# Budget profile screen in the native apps (screen 49)

Objective: let the user choose a predefined budget profile from the iOS and Android apps (GH #141, screen 49 only; screens 48 and 51 and the custom profile of screen 50 are out of scope).
Branch: `feat/perfil-porcentajes-apps` (working branch; one commit per platform so each can ship as its own PR). Delivery strategy: `ask-on-risk`.
Test runners: iOS `xcodebuild -project Mirach.xcodeproj -scheme Mirach -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test` (from `apps/ios`); Android `./gradlew testDebugUnitTest` and `./gradlew assembleDebug lint` (from `apps/android`).

## Specs

Source of truth for layout: Figma file `NY2IRzO5C4z6Y4NTfuAG2u`, node `154:1640` ("49 Perfil (Ajustes) con Personalizado · PER-03, PER-04, PER-06"). Flow spec: `docs/catalogo/flujos/ingreso-perfil-y-mes.md`. Contract: `GET/PUT /api/perfil/presupuesto` in `apps/api/openapi.json`.

- **S1 — Screen content.** A pushed screen with the standard back bar and the title `Perfil`. Below it, in secondary text: `Al cambiarlo, recalculamos todos tus meses con el perfil nuevo.` Then four cards, in this order, each with a title, a caption and a three-segment distribution bar (Necesidades, Gustos, Ahorro colours, widths proportional to the percentages, 2 pt gap, 6 pt high):
  1. `50 / 30 / 20` — `Equilibrado · Necesidades 50% · Gustos 30% · Ahorro 20%` — carries the tag `Recomendado` (always, selected or not).
  2. `60 / 20 / 20` — `Si tus gastos fijos son altos · Necesidades 60% · Gustos 20% · Ahorro 20%`
  3. `70 / 15 / 15` — `Para un mes ajustado · Necesidades 70% · Gustos 15% · Ahorro 15%`
  4. `80 / 10 / 10` — `Salir de deudas. Tus cuotas cuentan como necesidad · Necesidades 80% · Gustos 10% · Ahorro 10%`
  A full-width primary button `Guardar` sits at the bottom. Card: 16 pt padding, 8 pt gap, 12 pt between cards, no rounded corners. Selected card: 2 pt border in the primary action colour; others: 1 pt default border. Title uses the "Cuerpo destacado" style, caption the "Etiqueta" style, the tag the "Mini" style on the primary action colour. Use the existing design tokens and components of each app; no hardcoded colours.
- **S2 — No custom option.** The row `Personalizado: tú eliges los porcentajes` with the `Plus` tag that appears in the Figma frame is NOT built ("v1.0, sin la opción «Personalizado»"; PER-05 is v1.1, GH #156).
- **S3 — Load.** Opening the screen calls `GET /api/perfil/presupuesto` and selects the card matching `perfil` (`50_30_20`, `60_20_20`, `70_15_15`, `80_10_10`). While loading and on a load failure the screen follows the app's existing loading/error/retry pattern. If the stored profile is `personalizado`, no card is selected.
- **S4 — Save.** Tapping a card selects it locally. `Guardar` is disabled when the selection equals the stored profile ("sin cambios, el botón está deshabilitado"), when nothing is selected, and while saving ("Guardando: botón deshabilitado con progreso"). Saving sends `PUT /api/perfil/presupuesto` with only `{"perfil": "<id>"}`; `diaCorte` and `ingresoDeclarado` are omitted so they stay unchanged.
- **S5 — Save result.** On 200 the screen returns to where it was opened from and the Inicio (Resumen) data reloads so the new targets show ("el Inicio se recarga al volver"). On failure the screen stays open, keeps the selection, shows an error with the app's existing error presentation, and `Guardar` is enabled again. A 401 follows the app's existing session handling.
- **S6 — Entry point.** Assumption (neither app has the Ajustes tab of screen 14): the screen opens from a new row in the existing Perfil tab, labelled `Perfil de porcentajes`, using each app's existing push pattern (iOS `NavigationStack` destination; Android `rememberSaveable` state, no NavHost).
- **S7 — Accessibility.** Each card is one selectable element that announces its title, caption and selected state; the distribution bar is decorative.
- **S8 — Catalog.** `docs/catalogo/flujos/ingreso-perfil-y-mes.md` stops describing the profile endpoint and the "Cambiar de perfil" action as pending and documents the real call, body and codes.

Assumptions (not stated by the user): S6 entry point; the on-screen note of S1 is the recalculation warning required by the catalog, so no extra confirmation dialog is added; the percentages shown on the cards are static copy tied to the profile id, not business logic.

## Tasks

- [ ] T1 — iOS screen, API method, view model, tests (S1-S7). Route: delegated (Writer trigger a: two independent units, disjoint surfaces `apps/ios/**` vs `apps/android/**`, each several files). Commit: —
- [x] T2 — Android screen, API method, view model, tests (S1-S7). Route: delegated (same trigger). Note: the generated `PerfilPresupuestoUpdateRequest` only models `personalizado` with required `metas`, so the predefined PUT goes through the hand-written `PerfilPresupuestoApi` Retrofit service (same pattern as `CuentaApi`). Commit: `001d69e1`
- [x] T3 — Catalog update (S8). Route: inline (parent). Commit: the docs commit that holds this file.

## Log

- L1 (2026-11-19, user, verbatim): "quiero que comencemos a agregar al proyecto la sección de los %"
- L2 (2026-11-19, user, verbatim): "la pantalla en las apps para ajustar los porcentajes"
- L3 (2026-11-19, user, verbatim, answering whether to start with screen 49 or also bring forward screen 50): "vamos por 49 primero"
- L5 (2026-11-19): T2 delivered. `./gradlew testDebugUnitTest` and `./gradlew assembleDebug lint` reported BUILD SUCCESSFUL by the writer (19 new tests); the parent re-run was fully cached. RED was a compile failure, not a per-assert mutation check. Writer-added copy: «No pudimos guardar el perfil. Inténtalo de nuevo en unos segundos.» Resumen reload: new `perfilRevision` counter in `RootRoute.kt`. Commit is 775 changed lines, above the ~400 heuristic: one screen with its API, view model and tests, not split artificially.
- L6 (2026-11-20): T1 code delivered. `xcodebuild ... -only-testing:MirachTests test` reported TEST SUCCEEDED by the writer (812 tests, 16 new). The full run with MirachUITests was not completed by the writer; the parent runs that target before committing. Writer-added copy: «Cargando tu perfil de porcentajes…», «No pudimos guardar el perfil. Inténtalo de nuevo.» Resumen reload reuses the existing `resumenReload` counter. RDD is off (global), so no native review runs. Engram mirror pending: the save call could not be checked by auto mode.
- L4 (2026-11-19): Exploration found the API complete (#110, #111 closed), no client code beyond generated models, GH #141 open for screens 48/49/51 and #156 for screen 50. Figma node 154:1640 read; its frame includes the Plus row that S2 excludes.
