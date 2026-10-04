# Public-ready API (plan phase 5)

## Objective

Make the API fit for a public native app in the App Store and Google Play: sign-in with Apple and Google only, in-app account deletion, and no demo mode.

## Problem

- Demo mode existed for the academic delivery; it touches about 120 files (an `esDemo` branch in ~25 use cases, two `User` columns, a cron cleanup, routes, errors, tests, a landing link).
- There is no account deletion, and no relation from `User` cascades.
- Google login verifies tokens only against the Android client ID; iOS needs its own audience.
- There is no Sign in with Apple. App Store guideline 4.8 requires an equivalent privacy-preserving login when Google Sign-In is offered; in practice that is Sign in with Apple.

## Decisions

- **Sign-in (user, 2026-10-03): option A — Apple and Google only.** No email/password registration, so no password reset or email delivery to build. The existing password login stays dormant, like the other web pieces (ADR-046 D5).
- **Demo mode is removed, not dormant (user, 2026-10-03).** Amends ADR-046 D5, which listed it among the dormant web pieces.

## Store requirements (researched 2026-10-03; sources in the session report)

- Apple 4.8: offering Google Sign-In requires an equivalent login limited to name and email with private-email support.
- Apple 5.1.1(v): account deletion inside the app (a direct link to a web flow is allowed). Apps with Sign in with Apple must revoke the user's tokens through Apple's REST API on deletion.
- Google Play: in-app deletion path plus a public web resource to request deletion, declared in Data safety.
- Open: Apple 5.1.1(ix) / 3.2.1(viii) suggest financial apps be submitted by a legal entity. Being researched in depth; no code impact.

## Constraints

- Clean Architecture: domain → application → infrastructure; `Result<T,E>`, no exceptions in domain/application.
- Every endpoint returning user data keeps its isolation test (RNF-SEC-006).
- Sessions, encryption at rest (ADR-013) and copy-on-signup (ADR-036) keep working.
- Do not remove what demo shares with live code: `sec-fetch-guard.ts` (Google web routes), `IpRateLimiter` (Google mobile), `copiarCatalogoTemplate`, the user created by `seed.ts` for DAST, the catalog and ingestion use cases themselves.
- Contract changes go through `openapi-document.ts` and `pnpm api openapi:emit`; CI checks drift.

## TDD

- Mode: strict (session configuration). Runner: `pnpm --filter @mirach/api test` (vitest); integration and e2e via the CI ephemeral DB (`test:integration`, `test:e2e`, gated by `ALLOW_DESTRUCTIVE_DB=1`).
- Behaviour tasks (T2–T5) need an observed RED before implementation. T1 is a removal: proof is that the suite stays green and the demo route returns 404.

## Tasks

- [ ] **T1 — Remove demo mode.** Routes, use case, repository, seeder, cleanup service and cron, read-only errors and gates, `esDemo` in sessions and use cases, OpenAPI operation, demo tests and fixtures; migration dropping `User.esDemo`/`demoCreatedAt` and deleting any demo users; landing "Probar" link; ADR note amending D5. Route: delegated writer. Large but mechanical; delivered as chained PRs.
- [ ] **T2 — Google sign-in for iOS.** Accept an iOS client ID as an additional audience (`GOOGLE_CLIENT_ID_IOS`), with its env validation and capability flag. Route: delegated writer.
- [ ] **T3 — Sign in with Apple (login).** `appleSub` on `User`, Apple identity-token verifier (JWKS `appleid.apple.com/auth/keys`, `iss`, `aud` = bundle ID, `exp`, nonce), `LoginConApple` mirroring `LoginConGoogle` (match by `sub`, never by email; name and email arrive only on first authorization; relay emails), `POST /api/auth/apple/token`, OpenAPI. Route: delegated writer.
- [ ] **T4 — Apple token revocation support.** Exchange the authorization code at `/auth/token` with a client secret signed by the `.p8` key, store the refresh token encrypted, and revoke it through `/auth/revoke`. Secrets: Team ID, Key ID, `.p8`. Route: delegated writer.
- [ ] **T5 — Account deletion.** Use case and authenticated endpoint; deletes sessions, transactions, ingestions, patterns, categories, accounts and the user in one transaction (order proven by the demo cleanup); revokes Apple tokens when present; isolation and idempotency tests. Re-authentication policy to decide. Route: delegated writer.
- [ ] **T6 — ADR-047.** Records the sign-in decision (A), the demo removal, the deletion contract and the role of `x-api-key` (a non-secret client gate, not authentication). Route: inline.

## Out of scope here

- Public web page to request deletion (Google Play) → landing, plan phase 9.
- Apple Developer / Google Cloud console setup (bundle ID, Services ID, client IDs, `.p8`) → user, before T2–T4 can be tried live.

## Delivery

- Strategy: `ask-on-risk` (default). T1 alone exceeds the ~400-line budget, so the chain strategy is asked before its first commit.

## Progress

- Exploration done (auth map and store research, 2026-10-03).
- T1 / S1 done on branch `feat/remove-demo-entry` (stacked on `docs/infra-phase-4-done`): removed `GET /api/auth/demo` and its rate limiter, `CrearDemoUseCase` and port, `PrismaDemoRepository`, demo seed data and seeder, `DemoCleanupService` and the node-cron scheduler (dependency dropped), the OpenAPI operation, the demo lifecycle int-spec, the landing "Probar" CTA, `docs/demo-mode-notes.md`; ADR-046 D5 amended. Route: delegated writer. Checks: RED observed first (route answered 401 instead of 404), then tsc, 283 files / 2888 tests, lint (0 errors), api and landing builds, `openapi:check` all green. T1 stays open: S2 (`esDemo` gates and plumbing) and S3 (migration) remain.
- S1 commits `7992d10`, `f366a4b`, `b17c89d`; size +57 / −2146 (whole-file deletions of one unit; `size:exception`). Review: high, granted, four lenses, approved and acknowledged. Its one warning (existing demo rows are no longer purged before S3) does not apply to Mirach's database, which has 0 users (checked 2026-10-03); S3's migration deletes any demo users anyway.
- T1 / S2 done on branch `feat/remove-demo-gates` (stacked on `feat/remove-demo-entry`): removed every read-only demo gate and its plumbing so no code reads the flag. Six `*DemoSoloLecturaError` classes and specs, `log-demo-gate-trip`, `es-demo-de-sesion`, the `req` flag and its middleware fail-closed branch, the field in the session result, session record and identity types (and the session repository join), the parameter and branch in 17 use cases, the `usuario-demo` reasons of the Google login and link flows, the 403 `DEMO_SOLO_LECTURA` mappings and OpenAPI responses, the `req` parameter of `responderErrorTraducido` (only used for gate logging), and the three demo-gate int-specs. `GET /api/auth/me` no longer returns the field (intended contract change, asserted in `app.auth.spec.ts`, RED observed against a temporary mutation). Repositories no longer select the column. Columns and migrations untouched (S3). Route: single writer. Checks: tsc, 275 files / 2790 tests, lint (0 errors), build, `openapi:check` green; int/e2e specs edited but not run (need a DB; type-checked only).

## Next step

S2 PR, then S3.
