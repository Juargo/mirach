# App Review account

## Objective

Give the App Store reviewer a pre-loaded account with sample data, plus a downloadable sample statement to try the upload flow, without opening password login to anyone else.

## Problem

The iPhone app signs in only with Sign in with Apple, and a reviewer cannot use someone else's Apple ID. A fresh reviewer account would be empty. `POST /api/auth/login` (email and password) still exists and is mounted in production without a flag (ADR-047 D1 left it dormant: no user has a password), and the iOS app has no password form.

## Decision

User, 2026-10-09: approach A. One reviewer account that signs in with email and password, allowed only for an allowlisted email set by environment; the app shows the form only when the API says so; switched off after approval. Plus a public sample statement on the landing.

## Scope

- API (`feat/api-review-login`): allowlist env (only that email may use password login; unset = password login refused for everyone), capability flag, one-off script that creates the reviewer user with the catalog and sample data, ADR.
- iOS: password sign-in form shown only when the capability is on.
- Landing: sample statement download on `/soporte`, verified against the real parser first.
- Owner: set the env in Render, run the script against production, put the credentials in App Store Connect review notes.

## Constraints

- TDD strict (session configuration). API runner: `pnpm --filter @mirach/api test` (vitest); iOS runner: `xcodebuild test`; landing: structural checks (no unit-test runner).
- Never log or commit the reviewer password; the script reads it from the environment.
- Delivery: one PR per part (API, iOS, landing), merged in that order; strategy `ask-on-risk`.

## Tasks

- [x] **T1 — API: allowlisted password login and capability.** Route: delegated writer. Commit `35934be`. Acceptance: with the env unset, `POST /api/auth/login` refuses every credential with the existing generic error; with it set, only that email can log in; `GET /api/auth/capabilities` exposes the flag; OpenAPI regenerated; ADR written; tests RED then GREEN.
- [x] **T2 — API: reviewer-user script.** Route: same writer. Commit `5f5f008`. Acceptance: an idempotent one-off script creates (or updates) the reviewer user with an encrypted email, blind index, argon2 hash, the catalog template and sample transactions from a synthetic statement through the real parser; verifies the encryption key before writing; never logs the password; tested.
- [ ] **T3 — iOS: password sign-in form.** Route: delegated writer. Acceptance: the form appears only when the capability is on; it signs in through the generated `/auth/login` client and stores the session like Apple sign-in; errors mapped; tests RED then GREEN.
- [ ] **T4 — Landing: sample statement download.** Route: delegated writer. Acceptance: the file parses with the real API parser; `/soporte` links it; checks green.
- [ ] **Owner — Production setup.** Set the allowlist env in Render, run the script against production, record the credentials only in App Store Connect.

## Progress

- 2026-10-09: feature document created; worktree `~/dev/mirach-worktrees/review-api`.

- 2026-10-09 T1 (`35934be`): RED login.use-case.spec (2 of 4 new allowlist tests failed: unset and other-email still logged in), env.spec (4 failed), app.auth-capabilities.spec (8 failed) and schema spec (5 failed); GREEN after `LoginUseCase` got the allowlisted `Email | null`, `REVIEW_LOGIN_EMAIL` in env.ts, `passwordLoginEnabled` in the route and schema. Full unit suite 299 files / 3157 tests green, tsc, lint, `openapi:check`, `env:example:check` green; Swift client regenerated (only `Types+Components+Schemas.swift` changed); ADR-051 added.
- 2026-10-09 T2 (`5f5f008`): RED cartola-revision.fixture.spec and crear-usuario-revision.spec failed on missing modules (then one RED on the fixed-message wrapping of a sample-load failure); GREEN with the generator, fixture and script (18 new tests). Full unit suite 301 files / 3175 tests green. Manual run against a throwaway local Postgres: first run created user + 16 categories + 1 ingesta + 28 transactions, second run only refreshed the hash, a wrong key aborted before writing, a Supabase URL was refused by the gate.
- `cartola-ejemplo.xlsx` (iOS UI fixture) parses with the real BCI parser (15 rows, all April 2026), but a new `apps/api/prisma/fixtures/cartola-revision.xlsx` (Sep-Oct 2026, 28 rows) is used for the reviewer so Resumen shows recent data.

## Next step

T3 (iOS form) and T4 (landing sample), then the owner setup.
