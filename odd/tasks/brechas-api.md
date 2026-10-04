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
- [x] **P2 — Spend share.** The month summary returns each spending bucket's share of total spend in basis points, summing to exactly 10 000 when there is spend (rounding rule documented and tested), and a defined value when there is none. Route: delegated writer.
- [x] **P3 — Server copy.** "Gustos" → "Deseos" in user-facing text; voseo → neutral Spanish with "tú". Route: delegated writer.
- [ ] **P4 — Months with data.** An endpoint listing the months (`YYYY-MM`) that have movements for the session user, for the month selector; isolation test. Route: delegated writer.

## Delivery

One PR per slice, stacked to `main` in order. Each slice keeps tests and docs with it.

## Progress

- **P1 done** (branch `feat/api-contract-gaps`, 4 work-unit commits). Route: delegated writer.
  - Upload codes declared (shared `IngestaErrorResponse` and friends): 400 optional `code` enum `PDF_PROTEGIDO | PDF_PASSWORD_INCORRECTA | SIN_MOVIMIENTOS` (other 400 causes: message only); 409 `CATALOGO_INCOMPLETO`; 503 `CATALOGO_NO_DISPONIBLE`; 500 `{ message }`. On `POST /api/ingestas`, `/preview` and `/commit`. `403 CATEGORIA_INTERNA` on `PATCH` and `DELETE /api/categorias/{id}` (route tests added).
  - 401 now carries a `code`: `API_KEY_INVALIDA` (api-key gate), `SESION_INVALIDA` (session gate, `/auth/me`), `CREDENCIALES_INVALIDAS` (`/auth/login`, `/auth/google/token`, `/auth/apple/token`, same code for every cause). Declared on every operation except `GET /version` as `UnauthorizedResponse`, `ApiKeyUnauthorizedResponse` or `CredentialsUnauthorizedResponse`.
  - `esInterna: boolean` (required) on `CategoriaResponse` (list, create, update).
  - Orderings documented and pinned: categorias by `nombre` es-CL then `id` (now in memory, was DB-collation `nombre`); ingestas `creadoEn` desc then `id` desc (tiebreak added); bucket flat and detalle transactions `cargo` desc, `fecha` asc, `id` asc; detalle groups by subtotal desc, "Sin categoria" last; ingresos `fecha` asc, `id` asc; resumen anual Jan to Dec; movimientos `fecha` asc, `id` asc.
  - Review warnings fixed (no emitter was wrong; no spec change): 401 schemas now build their enums/literals from the constants in `auth-error-codes.ts` (RED: renaming a code there did not reach the schema); every 401 emitter (api-key and session middleware, `/auth/login`, `/auth/me`, Google and Apple token) is validated against its 401 schema, and every upload error body (400/409/503 incl. the rollback cause, 500) is validated against the zod schema of the spec with `additionalProperties: false` (`ingesta.error-bodies.spec.ts`, mutation-checked). The misleading `openapi-document.spec.ts` title now says it checks the enums.
  - Known intermittent: `test/auth-isolation.int-spec.ts` "POST /api/ingestas ... NO session" fails with `write EPIPE` (multipart upload rejected by the 401 before the body is consumed).

- **P2 done** (branch `feat/spend-share`). Route: delegated writer.
  - `participacionGastoBp: number | null` on each bucket of `GET /api/resumen` (and, because `/api/resumen/anual` reuses the same mapper and schema, on each of its 12 months; the catalog's annual block needs it for the reduced chart). Computed by the pure domain function `participacionDelGasto` (`domain/value-objects/participacion-gasto.ts`), called from `ResumenMes.crear`; the HTTP mapper only converts to number.
  - Rule: share = `total_bucket / sum(total of the 3 spend buckets)` in bp, largest-remainder (Hamilton) on BigInt: floor `total*10000/sum`, then the leftover bps (fewer than the buckets) go one each to the largest remainders `total*10000 mod sum`; ties go to the earlier bucket in `buckets` (Necesidades, Deseos, Ahorro). A zero-total bucket never gets a leftover. Total spend 0 (or any negative total) gives null on every bucket. Independent of income (still computed when `sinIngreso`); `total` and `porcentajeBp` are unchanged.
  - Tests: exact splits, tie rule, all-in-one-bucket, zero bucket, beyond `Number.MAX_SAFE_INTEGER`, no spend, 2000-case sum-to-10000 property loop, mapper, route (schema sync) and e2e.

- **P3 done** (branch `feat/server-copy`). Route: delegated writer.
  - Strings changed: 8 user-facing. "Gustos" → "Deseos": 1 source (`ETIQUETA_BUCKET_COPY[Deseos]`, which feeds the semáforo diagnosis, the advice message and `CATALOGO_INCOMPLETO`). Voseo → tú: 3 (`PerfilRechazadoError` "Revisá" → "Revisa", `VinculoRequierePasswordError` "configurá" → "configura", `ConfirmacionEliminacionInvalidaError` "escribí" → "escribe"). Usted → tú: 4 (`verifique` → `verifica` in `MovimientoManualInvalidoError`, `BucketCategoriaNoConcuerdaError`, `CategoriaFueraDeCatalogoError`). Messages already neutral untouched. `openapi.json` carries none of them (check passes, no regen).
  - Tests updated first (RED: 6 failures), then source: error specs, `semaforo-detalle.spec.ts`, `ingesta.routes.spec.ts`, `resumen-semaforo.e2e-spec.ts`.
  - Kept on purpose (not user-facing): `db-safety.ts` boot error "definí ALLOW_DESTRUCTIVE_DB=1" and `env.ts` boot/describe texts ("acá"), both operator-facing at startup; inline comments in `process-ingesta` and `reevaluar-categorias` use cases that say "Gustos"; fixture name `'Gustos personales'` in `categoria-por-defecto.spec.ts`; the bucket enum value was already `Deseos`.

## Next step

P3 PR, then P4.
