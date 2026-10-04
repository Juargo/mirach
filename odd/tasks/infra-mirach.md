# Infra Mirach (plan phase 4)

## Objective

Provision Mirach's own infrastructure for the API: Supabase database, Render web service, fresh secrets, migrated schema, and a verified `GET /version`.

## Problem

The repository has no deployment. ADR-046 (D2) forbids sharing anything with the MoneyDiary deployment, including keys. `render.yaml` still listed the MoneyDiary web origins for CORS.

## Scope

- In: `render.yaml` fixes; Supabase project; secrets generated locally; manual migrations; Render service from the blueprint; health and version check.
- Out: domain (not decided; native clients need no CORS), landing deploy (postponed to plan phase 9 so the MoneyDiary brand is not published), demo-mode switch and auth changes (phase 5), Google client IDs (phases 5, 7, 8).

## Constraints

- Secrets never enter the repository or the chat. They live in a local file outside the repo with mode `600`, and are typed by the user into the Render dashboard.
- Migrations run with BOTH `DATABASE_URL` and `DIRECT_URL` pointing at Supabase: with only `DATABASE_URL` set, Prisma migrates localhost silently.
- Render does not run `prisma migrate deploy`; migrations are manual.
- Create the Render service from this blueprint; never re-point the old MoneyDiary service (its `sync:false` secrets would not follow).
- Region: Render `virginia` and Supabase `us-east-1`, together.

## TDD

Strict mode is configured, but these tasks are configuration and provisioning, not behaviour. Proof is the checks listed per task.

## Tasks

- [x] **T1 — Blueprint for Mirach.** `render.yaml`: region `virginia`, empty `CORS_ALLOWED_ORIGINS` (explicit, so env.ts does not fall back to the dev default), Google variables documented as intentionally unset. Route: inline. Check: YAML parses; reviewed in PR.
- [x] **T2 — Supabase project.** Created `mirach` (ref `astnyucjavxzmpgjmdko`) in `us-east-1`, org "Juargo's Org", free plan, via the Supabase connector with user authorization (2026-10-03).
- [x] **T3 — Secrets.** Generate `API_KEY` (64 hex) and `ENCRYPTION_KEY` (base64 of 32 random bytes) into `~/.config/mirach/prod.env` (mode `600`). The user adds `DATABASE_URL` (transaction pooler, port 6543) and `DIRECT_URL` (session pooler, port 5432) from the Supabase dashboard after setting the database password.
- [x] **T4 — Schema.** `prisma migrate deploy` against Supabase with both URLs from the secrets file; then decide whether the seed applies (catalog template only, never demo or test users).
- [x] **T5 — Render service.** User: Render → New → Blueprint → `Juargo/mirach` (grant Render access to the private repo), load the `sync:false` secrets that apply (`DATABASE_URL`, `DIRECT_URL`, `API_KEY`, `ENCRYPTION_KEY`), leave Google ones empty.
- [x] **T6 — Verify.** `GET /` (health) and `GET /version` on the `onrender.com` URL; an authenticated call with the new `API_KEY` returns 2xx/4xx, never 5xx; a request with `Origin: http://localhost:5173` gets no `Access-Control-Allow-Origin` header (proves Render kept the empty CORS value).

## Notes

- Supabase free plan: two active projects per organization (MoneyDiary + mirach is the limit). Free projects pause after a period of inactivity.

## Progress

- T2 done (see above).
- T1 done: commit `f43b47a`. Review: high, granted, four lenses, approved and acknowledged. Two warnings said nothing proved that an empty `CORS_ALLOWED_ORIGINS` avoids the dev default. Added env tests for empty (→ `[]`) and missing (→ dev default) in this commit; proven able to fail by removing the empty-origin filter in env.ts (1 failed), restored (67 passed). Whether Render keeps an empty value is checked live in T6.
- T3 partial: `~/.config/mirach/prod.env` created (mode 600) with fresh `API_KEY` and `ENCRYPTION_KEY`; `DATABASE_URL` and `DIRECT_URL` pending from the user.

- T3 done (2026-10-03): user set an alphanumeric DB password (14 chars; lengthen later) and filled both URLs. Structure checked without reading credentials: transaction pooler `aws-0-us-east-1.pooler.supabase.com:6543` and session pooler `:5432`, user `postgres.astnyucjavxzmpgjmdko`, no MoneyDiary reference, file mode 600. First attempt failed: the `[YOUR-PASSWORD]` placeholder was left in `DATABASE_URL` and the first password had `&`, which broke shell loading.
- T4 done: `prisma migrate deploy` applied 20 migrations through `DIRECT_URL` (:5432); `migrate status` up to date. Read-only SQL check: 4 buckets (created by migrations), 0 users, 0 categories, 0 patterns, 20 rows in `_prisma_migrations`. Seed NOT run: it creates the fixed development user with account, categories and patterns; per-user catalogs come from copy-on-signup (ADR-036).

- T5 done (user): Render Blueprint from `Juargo/mirach` `main`, service `mirach-api` in Virginia (free), four `sync:false` secrets loaded, Google ones empty. URL: <https://mirach-api.onrender.com>.
- T6 done (2026-10-03): `GET /` 200 (52 s, free-tier cold start); `GET /version` → `{"version":"0.10.0","commit":"e6b82c5","ref":"main"}`; `/api/categorias` without key or with a wrong key → 401 "API key inválida o ausente", with the new key → 401 "Sesión inválida o expirada" (key accepted, session gate next, no 5xx); `Origin: http://localhost:5173` on `GET /version` and on the preflight returns no `Access-Control-Allow-Origin`, so Render kept the empty CORS value.

## Follow-ups

- Free Render instances sleep when idle; the first request after a pause takes ~50 s. Relevant before beta testers (plan phase 10).
- Lengthen the database password (currently 14 alphanumeric chars) and update both URLs in Render and in the local secrets file.
- Domain for the API still to be decided; until then clients use `mirach-api.onrender.com`.

## Next step

Phase 4 done. Next: plan phase 5 (API fit for a public app) or phase 6 (contract and reference for the apps), which can run in parallel.
