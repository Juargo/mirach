# Android T6b — Cartolas subidas + receive a shared file

Objective: finish the remaining Android statement-upload pieces that have a ready definition, as agreed on 2026-11-05. Branch `feat/android-t6b`. Delivery: chained PRs, stacked to main, one per unit (the user's cached choice). Test runner: `./gradlew :app:testDebugUnitTest` from `apps/android`.

## Specs

- **S1: Cartolas subidas (IMP-09, IMP-22, PRI-05).** Android port of iOS `apps/ios/Mirach/Features/CartolasSubidas/*`. It uses `GET /api/ingestas` and `DELETE /api/ingestas/{id}` (404 means "not found"). The entry point is a «Cartolas subidas» link in the Subir tab, as in iOS `SubirCartolaView.swift:332-342`. A deletion reloads Resumen.
  - States: loading, loaded (an empty list counts as loaded), and failed with a connection or server reason.
    - A failed pull to refresh keeps the list and shows a notice.
    - An expired session or a cancelled request shows nothing.
    - The row being deleted is disabled while the request runs.
    - After a deletion, the row is removed, the result is announced, `onChange` runs, and the list is fetched again.
  - Copy, verbatim from iOS:
    - Screen title: "Cartolas subidas".
    - Loading: "Cargando cartolas…".
    - Load errors: "Problema de conexión. Revisa tu conexión e inténtalo de nuevo." and "No pudimos cargar las cartolas. Inténtalo de nuevo en unos segundos.". Retry button: "Reintentar".
    - Empty list: "No hay cartolas cargadas. Sube una cartola para poder gestionarla aquí.". Its button, "Subir cartola", returns to Subir.
    - Delete confirmation dialog: "¿Eliminar esta cartola?", with "Eliminar" (destructive) and "Cancelar".
    - While deleting: "Eliminando…".
    - Accessibility label: "Eliminar cartola de {banco}, {fecha}".
    - Confirmation message for a processed statement: "Se eliminarán {N movimientos} de {banco} ({fecha}). Esta acción no se puede deshacer.". It says "eliminará" when N is 1.
    - Confirmation message for a failed statement: "Se eliminará esta cartola fallida de {banco} ({fecha}).".
    - Row: "Banco no identificado" when there is no bank; status "Procesada" or "Fallida"; "Motivo: {motivo}".
    - Deletion results: "Cartola eliminada", "Esa cartola ya no existía. Se quitó de la lista." and "No se pudo eliminar la cartola. Intenta nuevamente.".
    - Failed refresh: "No se pudo actualizar la lista.".
- **S2: Receive a shared file (IMP-01 "incluso compartiéndolo desde la app del banco o el correo").**
  - Mirach shows up when another app shares a `.pdf` or `.xlsx` (ACTION_SEND, and ACTION_VIEW for "Abrir con").
  - The file goes into the same staging and validation as the picker (`CartolaStaging`, `CartolaFileRules`), and the app opens the Subir tab.
  - Signed out: the file waits until the user signs in.
  - Consent pending: the file waits for the consent, the same way a file does after a 409.
  - Flow busy (previewing, deciding, reviewing, uploading, import error): the shared file is ignored and the user sees a notice. *Assumption:* notice copy «Termina o descarta la cartola en curso para subir la que compartiste.»
- **S3: Out of scope.** The bank guide (IMP-08) needs copy from Figma for both apps. Consent revocation (PRI-06) is scoped to v1.1 (#156).

## Tasks

- [x] V1 — S1 — delegated (parallel writer, disjoint surface from V2) — commits 60c04ff3, a4a6f101, dcbbf1c4 (the third also wires `RootRoute.kt`)
- [x] V2 — S2 — delegated (parallel writer, disjoint surface from V1) — commit: the share commit after dcbbf1c4
- [x] V3 — S1, S2 — inline (parent wires `RootRoute.kt` and the Subir snackbar) — seam check: full suite 403/403 passed, `lintDebug` clean, dcbbf1c4 passes its tests on its own

## Log

- L1 (2026-11-05): "sigamos con T6b en Android." Then: "sí, arranca con esas dos" (Cartolas subidas and receiving a shared file).
- L2: The map shows iOS has only Cartolas subidas. There is no iOS share extension, no bank guide, and no revocation. Android's generated `DefaultApi` already has `apiIngestasGet`, `apiIngestasIdDelete` and `apiConsentimientosTipoDelete`. `MirachApi` has none of them.
- L3: Route: two parallel writers (writer trigger (a): independent units with disjoint edit surfaces, each several files). `RootRoute.kt` is shared, so the parent edits it at the end.
- L4: V2 decisions:
  - `launchMode="singleTask"`, so a share reaches the running instance. The cost: Back does not return to the sending app.
  - A share after «Ahora no» reopens the consent.
  - Only `content://` URIs are accepted.
  - The inbox is cleared through `onConsumed`, before staging.
- L5: Slices, stacked to main:
  - PR A: API calls (60c04ff3, about 280 lines).
  - PR B: view model (a4a6f101, about 820 lines, of which 585 are tests; no cohesive split exists).
  - PR C: screen and link (dcbbf1c4).
  - PR D: receiving a shared file.
- L6: Emulator check, 2026-11-06, debug build against production, the user's account:
  - Mirach shows up in the Files share sheet. Sharing a PDF opens Subir and shows the preview.
  - Sharing again during the preview: the snackbar did not show. Bug: the notice was dismissed before it was shown. Fixed in a follow-up commit on #207 and checked again: the snackbar shows.
  - Cartolas subidas lists the real statements. Delete opens «¿Eliminar esta cartola?» with the right message, and Cancelar keeps the row. A real deletion was not tried, so no real data was deleted.
  - Back returns to Subir.
