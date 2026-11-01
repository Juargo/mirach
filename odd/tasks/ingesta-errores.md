# Ingest error codes and HTTP error fixes (#115)

Objective: finish #115 without card detection, which moved to #176.
Branches: `feat/codigos-ingesta`, then one branch per slice. Delivery: independent PRs to `main`, so the auth change gets its own review. Test runner: vitest.

## Specs

- S1. "Documentar en el contrato los códigos de `preview` y `commit`: `PDF_PROTEGIDO`, `PDF_PASSWORD_INCORRECTA`, `PDF_ESCANEADO`, `SIN_MOVIMIENTOS`, `BANCO_NO_RECONOCIDO`, `CATALOGO_INCOMPLETO`, `CATALOGO_NO_DISPONIBLE`, `CARTOLA_TARJETA_NO_SOPORTADA`."
- S2. "Validación con todos los problemas en una pasada (IMP-15)."
- S3. "Pendientes heredados: JSON mal formado → 400; caída de infraestructura en rutas de token → 5xx, no 401."
- S4. "Eliminar el endpoint deprecado de un paso `POST /api/ingestas` (verificar que ninguna versión publicada lo usa)."

## Tasks

- [x] T1 (S1) `PDF_ESCANEADO` and `BANCO_NO_RECONOCIDO`, emitted and in the contract. Route: inline.
- [x] T2 (S3) malformed JSON and token routes. Route: inline. PR #178, merge 4dc23c2.
- [x] T3 (S4) remove the one-step endpoint. Route: inline. Branch `feat/retirar-ingesta-un-paso`.

Route evidence: no Writer trigger; each slice is under about 100 lines of logic.

## Log

- L1 (2026-10-30, user): "continuemos el sprint".
- L2 (2026-10-31, user): picked "Separar (Recomendado)": card detection moves to #176, because the repo has no sample of a card statement.
- L3: S1, `CARTOLA_TARJETA_NO_SOPORTADA` moves with #176. The other five codes were already emitted and declared.
- L4: S2 needs no change. `EstructuraInvalidaError`, `NormalizacionInvalidaError` and `EstructuraPdfInvalidaError` already gather every problem of their stage into `message`; with invalid headers the rows cannot be evaluated.
- L5: T1 widens the 400 `code` enum, which oasdiff classes as ERR, so its PR needs `contrato-incompatible`. An installed iOS build keeps the server message for an unknown code (pinned by `previewDoesNotFailOnAnUnknown400CodeAndStillShowsTheMessage`); Android has no ingest flow.
- L6 (2026-11-01, user): "continuemos con la T3 de #115".
- L7: S4 evidence. No hand-written client ever called the endpoint: iOS history only touches preview and commit, Android has no ingest flow, and the landing never used it. Production traffic in Render logs was not checked.
- L8: `ProcessIngestaUseCase` stays because `pnpm cli` and integration tests use it; the issue only removes the endpoint. The route, its contract, `ingesta-upload.schema` and `ingesta-response.dto` are gone. T3 removes a contract operation, so its PR needs `contrato-incompatible`.
- L9: the e2e suites moved to `/commit`. Difference found: a persistence failure in commit answers 500 and writes no FALLIDA row, while the one-step route wrote one. Existing commit behavior, not changed here; the test now pins it.
- L10: checks. Unit 3416, integration 264, e2e 145, Android unit tests, iOS unit 571, `openapi:check`, lint without errors.
