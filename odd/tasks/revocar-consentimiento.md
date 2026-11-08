# Revoke the statement consent from Perfil (PRI-06)

Objective: both native apps let the person revoke the `cartolas` consent from Perfil. Branches: `feat/android-revocar-consentimiento`, `feat/ios-revocar-consentimiento` (one PR each, both to main). Delivery: one PR per app. Runners: Android `./gradlew testDebugUnitTest assembleDebug lint`; iOS `xcodebuild test -only-testing:MirachTests`.

## Specs

- **S1** PRI-06 (docs/requisitos/requisitos-funcionales-v1.md:236), quoted: "Revocar el consentimiento | Debería | Al revocarlo, se bloquea la importación de nuevas cartolas". The API already has `DELETE /api/consentimientos/{tipo}` (204, idempotent; 400 TIPO_CONSENTIMIENTO_INVALIDO; 401). Neither app calls it today.
- **S2** Perfil shows a section about the statement consent, based on `GET /api/consentimientos` (`cartolasVigente`):
  - In force: section title "Procesamiento de cartolas", text "Aceptaste que leamos tus cartolas para calcular tu 50/30/20.", button "Revocar consentimiento".
  - Not in force: same title, text "No has dado tu consentimiento. Te lo pediremos cuando subas una cartola.", no button.
  - While the status is unknown (loading, or its request failed), the section is not shown. A failed status request never blocks the rest of Perfil.
  - The status refreshes whenever Perfil refreshes (the screen opens or the tab comes back).
- **S3** "Revocar consentimiento" opens a confirmation. Title: "¿Revocar consentimiento?". Body: "No podrás subir nuevas cartolas hasta que vuelvas a aceptarlo. Tus movimientos ya importados no se borran." Buttons: "Revocar" (destructive) and "Cancelar". Only "Revocar" calls `DELETE /api/consentimientos/cartolas`. A second tap while the request is out does nothing.
- **S4** Result of the revocation:
  - 204: the section switches to the not-in-force state and shows "Consentimiento revocado".
  - No answer (offline, timeout): "Problema de conexión. Revisa tu conexión e inténtalo de nuevo." The section stays in force.
  - Any other server error: "No pudimos revocar el consentimiento. Inténtalo de nuevo." The section stays in force.
  - 401: left to the existing session relay (sign-out), with no message of its own, as other Perfil actions do.
- **S5** After a revocation, the next time the person opens Subir or tries an upload, the app shows the consent screen again ("Acepto y continúo" / "Ahora no").
- **S6** The copy is neutral Spanish with "tú" and identical in both apps (PerfilMessages rule). Assumption: the strings in S2-S4 were chosen by the orchestrator and can be changed by the user.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 Android | S1-S6 | delegated (Writer trigger a: two independent units in two apps, disjoint surfaces, launched together) | done (613 unit tests, 0 failures; parent spot check reran them) | 9db2f1b9 |
| T2 iOS | S1-S6 | delegated (same reason) | done (683 unit tests pass; parent spot check reran them) | b64c19a3 |

## Log

- **L1** (2026-11-08) The user's request, verbatim. To "¿Agrego la opción de revocar en el Perfil de Android, igual que en iOS?" the user answered "si". After the correction that iOS has no revoke UI either, the user chose "Android e iOS".
- **L2** Evidence: on the Android emulator, after a revocation done with SQL in prod, Subir showed the consent screen again, and accepting created a new active row. Server-side enforcement (403) was not tested directly.
- **L3** (2026-11-08) T1 Android 9db2f1b9 and T2 iOS b64c19a3. Both writers found the same S5 gap: Subir checked consent only once per ViewModel lifetime, so after a revocation the idle initial screen stayed. Both now re-check on the idle initial screen when the tab appears. The server signals missing consent on upload with 409 CONSENTIMIENTO_CARTOLAS_REQUERIDO, not 403. Two choices beyond the spec, matched in both apps: the dialog closes on "Revocar" and the button stays disabled, without extra text, while the request is out; a refresh clears the last result message.
- **L4** Emulator check of the Android build (review account, prod API): the section showed as in force, the dialog appeared, "Revocar" switched the section to not in force with "Consentimiento revocado", and Subir showed the consent screen again. Accepting restored a row in force. No manual check of iOS on a simulator. RDD is off (global), and native assess said medium / not due on both branches. Risk: none.
