# API gaps found by the screen catalog

## Objective

Close the contract gaps the screen catalog (`docs/catalogo/README.md`, "Brechas del API", PR #35) found, before generating the Swift and Kotlin clients from `openapi.json` (plan phase 6, T3).

## Problem

The native clients will be generated from `apps/api/openapi.json`. Today the spec omits error codes the API really returns, a field the apps need, the cause of a 401, and list ordering; the pie chart needs a spend share the old web computed on the client (thin clients forbid that, ADR-046 D9); some server copy says "Gustos" and uses voseo; and the month selector has no way to know which months have data.

## Decisions

- Order agreed with the user (2026-10-04): close the gaps before T2/T3 of phase 6.
- Server copy: neutral Spanish with "tú" (default proposed to the user; change before P3 if they object). The 30 % bucket is "Deseos".
- Apple token revocation (gap 6) stays in phase 5, T4 — blocked on Apple Developer credentials.

## Constraints

- Additive contract changes only; no existing field or code is renamed or removed except the "Gustos" wording.
- Money stays exact (integers, basis points); rounding rules tested explicitly.
- Every new or changed endpoint keeps its user-isolation test.
- `openapi.json` regenerated with `pnpm api openapi:emit`; CI checks drift.

## TDD

Strict. Runner: `pnpm --filter @mirach/api test` (vitest, fake `DATABASE_URL`, no `DIRECT_URL`/`ALLOW_DESTRUCTIVE_DB`); integration/e2e on a throwaway local Postgres 17.

## Tasks

- [x] **P1 — Contract.** Declare in OpenAPI the upload error codes (`PDF_PROTEGIDO`, `PDF_PASSWORD_INCORRECTA`, `SIN_MOVIMIENTOS`, `CATALOGO_INCOMPLETO` 409, `CATALOGO_NO_DISPONIBLE`, and any other the ingestion routes return) and `403 CATEGORIA_INTERNA`; add `esInterna` to `CategoriaResponse`; give 401 responses a stable `code` that tells "session invalid/expired" from "API key invalid/missing"; document (and pin with tests) the ordering of list endpoints. Route: delegated writer.
- [ ] **P2 — Spend share.** The month summary returns each spending bucket's share of total spend in basis points, summing to exactly 10 000 when there is spend (rounding rule documented and tested), and a defined value when there is none. Route: delegated writer.
- [ ] **P3 — Server copy.** "Gustos" → "Deseos" in user-facing text; voseo → neutral Spanish with "tú". Route: delegated writer.
- [ ] **P4 — Months with data.** An endpoint listing the months (`YYYY-MM`) that have movements for the session user, for the month selector; isolation test. Route: delegated writer.

## Delivery

One PR per slice, stacked to `main` in order. Each slice keeps tests and docs with it.

## Progress

- **P1 done** (branch `feat/api-contract-gaps`, 4 work-unit commits). Route: delegated writer.
  - Upload codes declared (shared `IngestaErrorResponse` and friends): 400 optional `code` enum `PDF_PROTEGIDO | PDF_PASSWORD_INCORRECTA | SIN_MOVIMIENTOS` (other 400 causes: message only); 409 `CATALOGO_INCOMPLETO`; 503 `CATALOGO_NO_DISPONIBLE`; 500 `{ message }`. On `POST /api/ingestas`, `/preview` and `/commit`. `403 CATEGORIA_INTERNA` on `PATCH` and `DELETE /api/categorias/{id}` (route tests added).
  - 401 now carries a `code`: `API_KEY_INVALIDA` (api-key gate), `SESION_INVALIDA` (session gate, `/auth/me`), `CREDENCIALES_INVALIDAS` (`/auth/login`, `/auth/google/token`, `/auth/apple/token`, same code for every cause). Declared on every operation except `GET /version` as `UnauthorizedResponse`, `ApiKeyUnauthorizedResponse` or `CredentialsUnauthorizedResponse`.
  - `esInterna: boolean` (required) on `CategoriaResponse` (list, create, update).
  - Orderings documented and pinned: categorias by `nombre` es-CL then `id` (now in memory, was DB-collation `nombre`); ingestas `creadoEn` desc then `id` desc (tiebreak added); bucket flat and detalle transactions `cargo` desc, `fecha` asc, `id` asc; detalle groups by subtotal desc, "Sin categoria" last; ingresos `fecha` asc, `id` asc; resumen anual Jan to Dec; movimientos `fecha` asc, `id` asc.
  - Known intermittent: `test/auth-isolation.int-spec.ts` "POST /api/ingestas ... NO session" fails with `write EPIPE` (multipart upload rejected by the 401 before the body is consumed).

## Next step

P1 PR, then P2.
