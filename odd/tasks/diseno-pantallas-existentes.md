# Figma design into the native apps — existing screens

Objective: bring the Figma design (file Mirach-UI `NY2IRzO5C4z6Y4NTfuAG2u`, page Diseño) into the screens that already exist in `apps/ios` and `apps/android`, after the foundation and the Inicio (`odd/tasks/diseno-base-inicio.md`, PRs #239, #240, #241).
Branch `feat/diseno-pantallas`, cut from the local `feat/diseno-base-inicio` (it holds both app units); pull requests are cut per platform and flow once #239 and #240 merge. Delivery strategy: `ask-on-risk`, chain strategy already chosen by the user for this line of work: separate pull requests to main. Runners: iOS `xcodebuild … -only-testing:MirachTests test` plus the UI tests of the touched screens, Android `./gradlew testDebugUnitTest assembleDebug lint`, tokens `pnpm design:check`.

## Specs

- **S1 — Scope.** "continuemos con el resto de las pantallas" (L1), after the parent listed what was pending: "llevar los estilos de texto y el espaciado por token al resto de las pantallas existentes, y después la navegación nueva con las pantallas que faltan". This feature covers only the screens that exist today in both apps. Out of scope: the tab bar and navigation structure, new screens, API changes, new data or features, and behavior (states, flows, validation, copy that carries meaning) of any screen.
- **S2 — Rules for every screen.**
  1. Figma is the visual source: read the screen's frame (node ids below) and match its composition, hierarchy, text styles, spacing and corner radius, using what the app already renders. Where the app shows something Figma does not (or the reverse, because the data or flow does not exist), keep the app's content and apply the visual language only; list each such difference in the report.
  2. Text uses the generated text styles (`MirachTextStyle` with `.mirachText(_:)` on iOS, `MirachTextStyles` on Android); spacing uses `MirachSpacing`; corners use `MirachRadius` (square); colors stay on the existing tokens. A measure Figma gives that has no token stays a literal.
  3. Figma shows icons as gray placeholder squares: keep the icons the app has today; never draw a placeholder.
  4. Touch targets stay at least 44pt (iOS) and 48dp (Android). Dynamic Type and font scale keep working: no fixed heights on text containers.
  5. User-facing copy is not changed unless Figma has different copy for the same element; list every copy change in the report. State words come from `MirachCopy`.
  6. Accessibility identifiers, test tags, content descriptions and screen-reader text keep working; a test that asserts a removed visual detail is updated to the new one.
  7. Shared controls are changed once, in `Core/Design` (iOS) or `core/design` (Android), and reused: do not restyle the same control screen by screen.
- **S3 — Shared controls** (first unit on each platform): primary and secondary buttons, text fields, cards or list rows, sheet parts and any other shared piece, restyled to Figma (frames 03 `3:66`, 07 `63:157` and 14 `91:368` show buttons, fields and rows) with the generated text styles, spacing tokens and square corners.
- **S4 — Subir cartola**: 03 `3:66`, 16 `114:442`, 18 `114:510`, 04 `3:69`, 24 `114:763`, 12 `90:368`, 12b `181:3707`, 20 `114:630`, 21 `114:663`, 22 `114:696`, 23 `114:731`, 37 `144:1097`. Code: iOS `Features/SubirCartola`, Android `features/subircartola`.
- **S5 — Categorías**: 26 `124:684`, 27 `124:888`, 28 `124:1050`, 29 `132:874`, 30 `132:951`. Code: iOS `Features/Categorias`, Android `features/categorias` and `features/categoriasheet`.
- **S6 — Detalle de bloque and reclassify**: 10 `90:232`, 09 `89:337`; the iOS «Ingresos del mes» screen has no frame and follows 10. Code: iOS `Features/DetalleBucket`, `Features/Ingresos`, Android `features/detallebucket`.
- **S7 — Sign-in, profile and uploaded statements**: 00 `89:180`, 31 `135:1005`, 14 `91:368` with 35 `142:1172` and 36 `142:1209` (the apps' Perfil stands in for Ajustes), 45 `151:1511` (the apps' «Cartolas subidas»). Code: iOS `Features/InicioDeSesion`, `Features/Perfil`, `Features/CartolasSubidas`, Android `features/signin`, `features/perfil`, `features/cartolassubidas`.

## Tasks

- [x] T1 — S3, S4 — delegated (Writer triggers: iOS and Android are parallel independent units with disjoint surfaces, and the parent session is past the context backstop) — iOS: shared controls and Subir cartola. Commit `8389968c`.
- [x] T2 — S3, S4 — delegated (same) — Android: shared controls and Subir cartola. Commit `edc01595`.
- [x] T3 — S5 — delegated — iOS: Categorías. Commit `d98a3ce7`.
- [x] T4 — S5 — delegated — Android: Categorías. Commit `5bee13ac`.
- [x] T5 — S6 — delegated — iOS: Detalle de bloque, reclassify, Ingresos. Commit `896b04bc`.
- [x] T6 — S6 — delegated — Android: Detalle de bloque, reclassify. Commit `26113603`.
- [x] T7 — S7 — delegated — iOS: sign-in, Perfil, Cartolas subidas. Commit `23172582`.
- [x] T8 — S7 — delegated — Android: sign-in, Perfil, Cartolas subidas. Commit `c8e0b94e`.
- [x] V — independent verifier (L4): no blockers in the static review; S1–S3 PASS; S4–S7 PASS on builds, unit tests and diff review. NOT VERIFIED: the full iOS UI suite (the simulator stalled; 28 tests passed, 1 failed on an event-synthesis timeout) and the verifier's iOS visual spot check.

One writer per platform at a time: two builds of the same project cannot run together.

## Log

- L1 (2026-11-11), user: "continuemos con el resto de las pantallas"
- L2 (2026-11-11), analysis: `MirachSpacing` and `MirachRadius` had no uses in `Features` before the Inicio; shared buttons use corner radius 12 on iOS while the token is 0; Android uses Material defaults. The Android emulator `mirach_test` holds the user's signed-in session against the real API, so workers do not touch it; the parent does read-only visual checks there.
- L3 (2026-11-11), evidence per task. Android (T2, T4, T6, T8): `./gradlew testDebugUnitTest assembleDebug lint` 657 tests, 0 failures after each task; the parent looked at the consent screen, the Categorías list, a category detail, the Necesidades detail and Perfil on the emulator (read-only, review account). iOS (T1, T3, T5, T7): 737 unit tests pass; the UI tests of each flow pass (11, 11, 14 and 14 selected tests); each writer captured its screens in the simulator. Parent fixes: `MirachTextField` gained `enabled` (the protected category name used a focus workaround) and the Android «+ Nueva categoría» row was aligned with the list. Declared copy changes: Android «+ Agregar patrón» → «Agregar patrón» and a visible «+ Nueva categoría» row instead of the top-bar "+"; iOS visible «+ Nueva categoría» row and «Crear» → «Crear categoría» as a pinned button. Pattern «Eliminar» on Android is muted instead of red, as in Figma. What Figma shows and the apps do not have (bank list, steps, «Saltar», explanation icons, the Ajustes list, the full-screen delete explanation, month groups, «Lectura», per-category bars, the state word in the bucket detail) was not built: no data or flow exists for it.
- L4 (2026-11-11), verifier: accessibility identifiers identical on iOS (165 uses) and test tags identical on Android; no view-model, networking or presentation file changed; destructive confirmations, the typed-word gate, locked states and save rules unchanged; no touch target under 44pt or 48dp in the changed files; tokens 22 of 22 and `pnpm design:check` OK. Advisories: the final delete-account confirm is filled destructive on Android and outlined destructive on iOS; disabled iOS buttons use 0.4 opacity (contrast not measured). The full iOS UI suite could not be completed locally: the machine reached a load average of 187 with stalled simulator processes, and a single-test rerun did not finish either. Next: CI on the pull requests runs the full iOS UI suite in three shards; `testDiscardingFromTheReviewAsksForConfirmation` is the one to watch.
- L5 (2026-11-12), user: "deja el botón rojo relleno en iOS también". The final delete-account confirm on iOS is the filled button again: `PrimaryButtonStyle` fills with `Base.destructive` when the button has the destructive role (test `aDestructiveFilledButtonUsesTheDestructiveColour`, written with the change). 738 unit tests pass; the two delete-account UI tests pass, and `testDiscardingFromTheReviewAsksForConfirmation` passes in 16 s on a healthy simulator, so its earlier failure came from the stalled machine.
