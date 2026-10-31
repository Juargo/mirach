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
- [ ] T2 (S3) malformed JSON and token routes. Route: inline.
- [ ] T3 (S4) remove the one-step endpoint. Route: inline.

Route evidence: no Writer trigger; each slice is under about 100 lines of logic.

## Log

- L1 (2026-10-30, user): "continuemos el sprint".
- L2 (2026-10-31, user): picked "Separar (Recomendado)": card detection moves to #176, because the repo has no sample of a card statement.
- L3: S1, `CARTOLA_TARJETA_NO_SOPORTADA` moves with #176. The other five codes were already emitted and declared.
- L4: S2 needs no change. `EstructuraInvalidaError`, `NormalizacionInvalidaError` and `EstructuraPdfInvalidaError` already gather every problem of their stage into `message`; with invalid headers the rows cannot be evaluated.
- L5: T1 widens the 400 `code` enum, which oasdiff classes as ERR, so its PR needs `contrato-incompatible`. An installed iOS build keeps the server message for an unknown code (pinned by `previewDoesNotFailOnAnUnknown400CodeAndStillShowsTheMessage`); Android has no ingest flow.
