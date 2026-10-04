# Contract and reference for the native apps (plan phase 6)

## Objective

Give the iPhone app (and later the Android app) a single, written reference: a screen catalog both apps implement, design tokens taken from one source, and API clients generated from `apps/api/openapi.json`.

## Problem

The product reference lives in the old repository, split across a React web app and an Expo app that diverged: different screens, different palettes, and both label the 30 % bucket "Gustos" although the official term is "Deseos". Without one catalog, two native apps written from scratch will drift.

## Decisions

- **Scope of iPhone v1 (user, 2026-10-04):**
  - Include: Resumen of the month (traffic light, pie, income, yearly summary); bucket detail with reclassification; income of the month; upload a statement (preview, per-row review, commit) including password-protected PDFs; categories and patterns (create, edit, delete); profile name and **account deletion**; **list of uploaded statements and deleting one** (the only way to undo a wrong upload).
  - Later: traffic-light detail per bucket, deleting a single movement, re-evaluating patterns, help/glossary, light/dark theme selector.
  - Out: email/password login and password change (ADR-047), linking/unlinking Google from the profile, manual movement entry, the "offer a pattern after reclassifying" flow, demo mode.
- **Design source:** the web palette ("Clínico frío" light / "Tinta cálida" dark, `DESIGN.md`) is the token source, not the older Expo palette.
- **Terminology:** the app says "Deseos", never "Gustos".

## Constraints

- Thin clients (ADR-046 D9): any business calculation a screen needs belongs in the API.
- Every endpoint named in the catalog must exist in `apps/api/openapi.json` on `main`; gaps are listed, not invented.
- Docs in neutral Spanish, like the rest of the repository docs.

## Tasks

- [x] **T1 — Screen catalog.** `docs/catalogo/`: an index plus one document per v1 screen (purpose, data shown, actions, endpoints verified against `openapi.json`, loading/empty/error states, navigation, notes for iPhone), a "later" list and an "out" list, and an API gap list. Route: delegated writer (reads the old web and Expo screens).
- [x] **T2 — Design tokens.** One source file (format to decide, e.g. JSON) with the web palette for both themes, bucket and traffic-light colors, typography and radius rules from `DESIGN.md`, plus the labels (Deseos). Route: to plan after T1.
- [ ] **T3 — Generated clients.** Generator choice and configuration for Swift and Kotlin from `openapi.json`, and the CI check that fails when the spec changes without regenerating. Route: to plan; may land with plan phase 7 when `apps/ios` exists.

## Progress

- Inventory of the old web and Expo screens done (2026-10-04, read-only exploration).
- T1 done (2026-10-04): `docs/catalogo/README.md`, `docs/catalogo/pantallas/_plantilla.md` and nine screens (`inicio-de-sesion`, `resumen-del-mes`, `detalle-de-bucket`, `ingresos-del-mes`, `subir-cartola`, `cartolas-subidas`, `categorias`, `detalle-de-categoria`, `perfil`). Endpoints checked against `openapi.json`. API gaps found (ten, listed in the README): undocumented upload error codes (preview/commit: PDF_PROTEGIDO, PDF_PASSWORD_INCORRECTA, SIN_MOVIMIENTOS, CATALOGO_INCOMPLETO 409); undocumented 403 CATEGORIA_INTERNA; no `esInterna` in `CategoriaResponse`; no spend-share percentage for the pie; server copy says "Gustos" (semaforo, CATALOGO_INCOMPLETO); Apple token revocation on account deletion is a noop; server messages with voseo; 401 without cause; undocumented list order; no endpoint for months with data. Protected PDFs are supported (multipart `password` on preview and commit).
- T2 done (2026-10-04): `design/tokens.json` (W3C DTCG; `color.light.*` / `color.dark.*`, 111 leaves: 49 per theme, 13 shared), `design/README.md`, `scripts/check-design-tokens.mjs` and `pnpm design:check`. 66 contrast pairs checked, all green. Lowest text pair 4.24:1, lowest graphic pair 3.01:1 (dark sin-categoria on card). Findings: two web-palette pairs fall below 4.5:1 ("Sin datos" ink on its 15% wash: dark on card 4.24, light on background 4.42), kept as explicit known exceptions without changing values. No web value for "sin datos" fill/band, type scale or spacing; none invented.

## Next step

T2 PR; T3 with plan phase 7.
