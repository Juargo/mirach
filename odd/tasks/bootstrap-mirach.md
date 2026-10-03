# Bootstrap Mirach

## Objective

Turn the imported API and landing (filtered from `Juargo/MoneyDiary`) into the clean base of the Mirach repository: decisions recorded, web/mobile leftovers pruned, names updated, CI green.

## Problem

The history import (plan phase 2) moved `apps/api`, `apps/landing` and the root tooling verbatim. Root scripts, CI jobs, release-please, lint-staged and pnpm overrides still reference `apps/web`, `apps/mobile` and `packages/api-client`, which did not move. Package names and service names still say `moneydiary`. The gitleaks ignore list points at commit SHAs that `git filter-repo` rewrote.

## Why

Plan phases 1 and 3: <https://claude.ai/artifact/687mgbtMNsW2n1xfDyq57j>. The native apps (Swift first, Kotlin second) need a green, honest base before any mobile code lands.

## Scope

- In: ADR for the founding decisions; pruning of web/mobile/api-client references; `@moneydiary/*` → `@mirach/*` package scope and the identifiers derived from it; regenerated `.gitleaksignore`; new README, CLAUDE.md, AGENTS.md; historical ADRs marked in the index.
- Out: domains (`moneydiary.cl`, `api.moneydiary.cl`) and landing copy/brand stay until the new domain is decided (plan phase 9); new infrastructure (phase 4); API auth changes (phase 5).

## Constraints

- No behaviour change in the API. Tests and builds must stay green after every task.
- Piezas web del API quedan dormidas (D5): do not delete cookie session, CORS, Sec-Fetch guard, demo mode or Google web OAuth.
- ADRs keep their original numbers (D6).
- Never copy `.env` files or secrets from the old repo.
- Commits: Conventional Commits, no AI attribution.

## TDD

- Mode: strict (session configuration). Source: gentle-ai session instructions.
- Runner: `pnpm --filter @mirach/api test` (vitest).
- These tasks change tooling, docs and identifiers, not behaviour, so no RED test applies; the checks below are the proof.

## Delivery

- Branch: `chore/bootstrap-mirach`. Strategy: `ask-on-risk`. Forecast: config/docs heavy; rename touches ~50 files outside docs.
- Push and PR are the user's decisions.

## Tasks

- [x] **T1 — ADR-046: founding decisions of Mirach.** One ADR recording D1–D9 of the plan, plus its row in `docs/adr/README.md` and `estado-implementacion.md`. Route: inline (single doc file + 2 index rows).
- [x] **T2 — Prune web, mobile and api-client references.** Root `package.json` scripts, `.lintstagedrc.json`, `pnpm-workspace.yaml` overrides used only by web/Expo, `.github/workflows/ci.yml` jobs and path filters, `mobile-release.yml`, `release-please-config.json` and manifest, `dependabot.yml`, `scripts/`. Route: delegated writer (2+ non-trivial files, ci.yml is 48 KB).
- [x] **T3 — Regenerate `.gitleaksignore`.** New fingerprints for the 5 known false positives after the SHA rewrite. Route: inline.
- [x] **T4 — Rename package scope to `@mirach/*`.** Package names, every `pnpm --filter`, root shortcuts, Render service name in `render.yaml`, docker-compose names. Domains untouched. Route: delegated writer.
- [x] **T5 — Repository docs.** New README, CLAUDE.md, AGENTS.md for Mirach; historical ADRs (web, Expo, academic scope) marked in the index; review the pre-push OpenSpec artifact check now that `openspec/changes` did not move. Route: delegated writer.
- [ ] **T6 — Clear the high-severity audit findings.** 14 high advisories: `brace-expansion` (via `exceljs > archiver` at runtime, and via eslint tooling), `devalue` (via `astro`, landing build), `fast-uri` (via commitlint), `undici` (via vitest/jsdom). Prefer upgrades or overrides to a patched version; baseline in `auditConfig.ignoreGhsas` only with a written reason when no patch exists. Needed for the "CI green" criterion. Route: delegated writer.

## Acceptance criteria

- `rg -i 'apps/(web|mobile)|api-client' --glob '!docs/adr/**' --glob '!openspec/**' --glob '!pnpm-lock.yaml'` returns nothing actionable.
- `pnpm install --frozen-lockfile`, API tests, API build and landing build pass locally.
- `gitleaks git .` reports no leaks.
- CI runs green on GitHub once pushed.

## Checks

- `pnpm install --frozen-lockfile`
- `DATABASE_URL=postgresql://u:p@localhost:5432/fake pnpm --filter <api> exec prisma generate && pnpm --filter <api> test`
- `pnpm --filter <api> build` · `pnpm --filter <landing> build`
- `gitleaks git . --no-banner --redact`

## Progress

- Phase 2 done: repo created private at `Juargo/mirach`, 1,243 commits, 15 API/landing tags, first own commit `173d21b`. 2,927 API tests green, API and landing builds green. Initial push used `--no-verify` because the pre-push hook needs `origin/main`, which did not exist yet.
- Engram mirror `odd/bootstrap-mirach/tasks`: PENDING (save refused: several active sessions match the project).
- T1 done: `docs/adr/ADR-046-fundacion-mirach.md` plus rows in `README.md` and `estado-implementacion.md`. Check: structural readback (docs only).
- T2 done: commit `877c23a`. Removed web/mobile/api-client from package.json, lint-staged, ci.yml (jobs api-client, web, web-e2e, mobile, outputs, sast paths, ci-success needs), release-please (mobile-build job, config, manifest), mobile-release.yml, dependabot, vercel-ignore-build.sh, workspace `packages/*` and the `browserslist` and `@xmldom/xmldom` overrides (absent from lockfile; lockfile lost only those 2 override lines) plus 2 image-size audit ignores. Checks: actionlint OK, `pnpm install --frozen-lockfile` OK, API tests 2927 passed, API and landing builds OK, jq OK. Review: tier high, consent granted, four lenses, approved and acknowledged. The one warning (image-size audit ignores still needed by landing) was checked and does not apply: `image-size` is absent from `pnpm-lock.yaml`.
- T3 done: commit `492f46f`. `.gitleaksignore` regenerated with the 5 post-rewrite fingerprints; dropped the entries for files that did not move. Check: `gitleaks git .` reports no leaks. Assessed medium, under budget; reviewed together with T4.
- T4 done: commit `200b959`. Renamed `@moneydiary/{api,landing}` and root `moneydiary` to `@mirach/*`/`mirach` (package.json x3, pnpm-workspace comment, lint-staged, render.yaml service `mirach-api` and filters, ci.yml integration/e2e Postgres service names, docker-compose container/user/db/volume, local-test-db and runbook docs, two test comments). Lockfile unchanged (importers are keyed by path). Checks: actionlint OK, `pnpm install --frozen-lockfile` OK, API tests 2927 passed, API and landing builds OK, `docker compose config` OK.
- Review of the T3+T4 slice (`877c23a..200b959`): tier high, consent granted, four lenses, approved and acknowledged. The first capture attempt failed in preflight (my launcher passed the tokens as one argument; nothing mutated); relaunched after STATUS re-offered the same slots. Two warnings, neither applicable here: renaming the Render service would orphan an existing Blueprint's secrets (no service is linked yet; phase 4 creates new infra), and an old hand-written `.env.test` would keep the `moneydiary` DB URL (this repo has none). Carry the first one into phase 4: create the Render service from this blueprint, never re-point the old one.
- Discovered while closing T2: `pnpm audit --audit-level high` reports 14 high advisories (the old repo reports 17 today, so they predate this branch). The CI security job gates on that command, so it will fail. Added T6.
- T5 done: the previous commit adds root `CLAUDE.md`, `AGENTS.md`, `README.md`, the runbook note, the `@mirach/api` and root package descriptions and the Mirach slug in `scripts/vercel-ignore-build.sh`; this commit marks ADR-003, 008, 010, 012, 017, 022 and 043 as `Histórico` and ADR-018 as partly historical in the index and `estado-implementacion.md`. OpenSpec check: both modes already exit 0 when `openspec/changes` is absent, so no script change. Checks: both openspec modes exit 0, forbidden-term `rg` empty, relative links resolve (only planned `apps/ios`, `apps/android` and the gitignored `.env` are absent), `bash -n` OK, `pnpm install --frozen-lockfile` OK, landing build OK.

## Next step

T6.
