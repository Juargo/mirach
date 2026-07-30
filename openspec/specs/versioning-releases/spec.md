# Versioning & Release Automation Specification (repo-wide tooling)

## Purpose

Defines the required BEHAVIOR of commit enforcement (ADR-020), independent
per-workspace semantic versioning via release-please (ADR-030), path-scoped
CI, and hybrid CD across the four workspaces (`apps/api`, `apps/web`,
`apps/mobile`, `apps/landing`). This is a delta spec for a new change — it
does not modify an existing capability spec. Config file contents (exact
`release-please-config.json` fields, workflow YAML, `vercel.json` shape) are
design detail; this spec only pins the observable behavior those configs
must produce.

Several requirements below describe CI/CD platform behavior that cannot be
unit-tested with Vitest — they are marked **[observed]** and MUST instead be
verified by triggering a real PR/push/tag and inspecting the resulting
workflow run, deploy log, or GitHub Release, per this repo's existing
verification discipline (ADR-015 layered verification).

## Requirements

### Requirement: CMT-01 — Local commit-msg hook rejects non-Conventional-Commit messages

The repository root MUST run a `commit-msg` git hook (husky + commitlint)
that validates every local commit message against Conventional Commits
before the commit is created.

#### Scenario: A valid Conventional Commit is accepted locally

- GIVEN a developer has staged changes in `apps/api`
- WHEN they commit with the message `feat(api): add resumen anual endpoint`
- THEN the commit-msg hook passes and the commit is created

#### Scenario: A malformed commit message is rejected locally

- GIVEN a developer has staged changes
- WHEN they attempt to commit with the message `updated stuff`
- THEN the commit-msg hook fails
- AND no commit is created

### Requirement: CMT-02 — CI gate rejects non-Conventional-Commit messages on a PR

A CI job MUST validate every commit on a pull request against Conventional
Commits and MUST fail the job when any commit on the PR does not comply.
This is the real enforcement per ADR-020 (local hooks are convenience and can
be bypassed with `--no-verify`).

#### Scenario: A PR with only valid Conventional Commits passes CI

- GIVEN a pull request whose commits are `feat(web): ...` and `fix(api): ...`
- WHEN the commitlint CI job runs
- THEN the job succeeds

#### Scenario: A PR containing a malformed commit fails CI

- GIVEN a pull request that includes a commit message `updated stuff`
  (bypassed the local hook, e.g. via `--no-verify` or a squash-less push)
- WHEN the commitlint CI job runs
- THEN the job fails
- AND the PR shows a failing required check

### Requirement: REL-01 — A `feat` touching one package's path opens/updates that package's release PR with a minor bump

release-please MUST track each of the four `apps/*` workspaces as an
independent component keyed by its path. Merging a `feat:` commit whose
changed files are entirely under one component's path MUST cause
release-please to open or update a release PR that bumps ONLY that
component's version (minor bump under the 0.x baseline) and appends an entry
to that component's `CHANGELOG.md`. No other component's version or
changelog MUST be touched.

#### Scenario: A `feat` scoped to `apps/api` bumps only the api component

- GIVEN the api component is at `0.3.0` and web/mobile/landing are at their
  own independent versions
- WHEN a `feat(api): ...` commit whose diff is entirely under `apps/api/**`
  is merged to `main`
- THEN release-please opens/updates a release PR proposing api `0.4.0`
- AND the proposed api `CHANGELOG.md` gains an entry for the feature
- AND no other component's version or changelog changes in that release PR

### Requirement: REL-02 — A `fix` touching one package's path bumps that package's patch version

#### Scenario: A `fix` scoped to `apps/web` bumps only the web patch version

- GIVEN the web component is at `0.2.1`
- WHEN a `fix(web): ...` commit whose diff is entirely under `apps/web/**`
  is merged to `main`
- THEN release-please opens/updates a release PR proposing web `0.2.2`
- AND the api/mobile/landing components are unaffected

### Requirement: REL-03 — A change touching only one package's path never bumps another package

release-please MUST derive each component's proposed bump strictly from
commits whose changed paths fall under that component's tracked path. A
commit confined to one component's path MUST NOT appear in, or affect the
version of, any other component's release PR.

#### Scenario: A web-only change does not bump the api component

- GIVEN the api component is at `0.3.0`
- WHEN a `feat(web): ...` commit whose diff is entirely under `apps/web/**`
  is merged to `main`
- THEN the api component's version stays at `0.3.0`
- AND no release PR content references the api component for that commit

### Requirement: REL-04 — Merging a release PR cuts a `<component>-vX.Y.Z` tag, GitHub Release, and CHANGELOG

Merging a release-please release PR for a component MUST create a git tag of
the form `<component>-vX.Y.Z` (e.g. `api-v0.4.0`), MUST publish a
corresponding GitHub Release, and MUST commit the updated `CHANGELOG.md` for
that component to `main`.

#### Scenario: Merging the api release PR tags and releases api

- GIVEN an open release PR proposing api `0.4.0`
- WHEN the release PR is merged to `main`
- THEN a tag `api-v0.4.0` exists on `main`
- AND a GitHub Release for `api-v0.4.0` exists
- AND `apps/api/CHANGELOG.md` on `main` includes the `0.4.0` entry

### Requirement: REL-05 — Root package is never tracked or versioned by release-please

The monorepo root (`package.json` at the repo root) MUST NOT be a tracked
release-please component. No release PR MUST ever propose a version bump,
tag, or CHANGELOG for the root package.

#### Scenario: A root-only dependency bump produces no root release

- GIVEN a commit that only changes the root `package.json`/`pnpm-lock.yaml`
  (e.g. a root devDependency bump)
- WHEN release-please evaluates commit history after the merge
- THEN no release PR proposes a root version, tag, or CHANGELOG entry

### Requirement: REL-06 — Each component starts from a 0.x baseline, and a breaking change still rides as a minor bump

All four components MUST be seeded at a `0.x` baseline (not `1.0.0`). While
still on `0.x`, a `feat!:`/`BREAKING CHANGE:` commit MUST bump the minor
version component (per semver's pre-1.0 convention), NOT the major version.

#### Scenario: A breaking change on a 0.x component bumps minor, not major

- GIVEN the mobile component is at `0.4.2`
- WHEN a `feat(mobile)!: ...` commit with a `BREAKING CHANGE:` footer, scoped
  entirely to `apps/mobile/**`, is merged
- THEN the proposed release PR bumps mobile to `0.5.0`
- AND the version does NOT jump to `1.0.0`

### Requirement: CI-01 — A PR touching only one workspace's path skips other workspaces' CI jobs **[observed]**

CI MUST use path filters so that a pull request whose diff is confined to
one workspace's directory only runs that workspace's jobs (lint/typecheck/
test/build), not the other three workspaces' jobs.

#### Scenario: A landing-only PR does not run api/web/mobile jobs

- GIVEN a pull request whose diff is entirely under `apps/landing/**`
- WHEN the CI workflow runs on that PR
- THEN the landing job(s) run
- AND the api, web, and mobile jobs do NOT run (skipped or absent from the
  run, not merely passing-empty)

### Requirement: CI-02 — A mobile-touching PR runs the mobile jest-expo job **[observed]**

CI MUST include a mobile job (jest-expo + RNTL, per ADR-017) that runs when a
PR's diff touches `apps/mobile/**`. This job does not exist today and is new
in this change.

#### Scenario: A mobile-only PR runs the mobile test job

- GIVEN a pull request whose diff is entirely under `apps/mobile/**`
- WHEN the CI workflow runs on that PR
- THEN the mobile jest-expo job runs and its result is a required/visible
  check on the PR

### Requirement: CI-03 — CI uses the pinned Node patch version **[observed]**

CI's `setup-node` step MUST use the exact Node version pinned in
`.node-version` (`22.22.3`), not a drifting major-only version (`22`).

#### Scenario: CI runner reports the pinned Node patch version

- GIVEN the CI workflow's `setup-node` step configured against
  `.node-version`
- WHEN a CI job runs
- THEN the reported Node version is `22.22.3`, not merely `22.x`

### Requirement: CD-01 — A push/tag that doesn't touch `apps/api/**` does not trigger an api redeploy **[observed]**

The api deploy path (Render) MUST be filtered so that a push to `main` (or a
release tag) whose diff does not include `apps/api/**` (or shared root
dependency changes affecting the api build) does not trigger a new Render
deploy of the api service.

#### Scenario: A web-only merge to main does not redeploy the api

- GIVEN a merge to `main` whose diff is entirely under `apps/web/**`
- WHEN Render evaluates the push against the api service's path filter
- THEN no new api deploy is triggered

### Requirement: CD-02 — A `mobile-v*` tag triggers a mobile EAS build **[observed]**

A git tag matching `mobile-v*` (cut by release-please for the mobile
component per REL-04) MUST trigger a GitHub Actions workflow that runs an
EAS build for the mobile app.

#### Scenario: A mobile release tag triggers an EAS build job

- GIVEN release-please merges the mobile release PR and creates tag
  `mobile-v0.5.0`
- WHEN that tag is pushed
- THEN a GitHub Actions workflow run starts an EAS build for `apps/mobile`

### Requirement: CD-03 — release-please and EAS never write the same mobile version field

release-please MUST own `apps/mobile/app.json`'s `version` field exclusively.
EAS MUST own `versionCode`/`buildNumber` exclusively (via its existing
`autoIncrement`/`appVersionSource:"remote"` configuration). Neither system
MUST write the field the other owns.

#### Scenario: A mobile release PR updates version but not versionCode/buildNumber

- GIVEN the mobile release PR bumps `app.json > version` from `0.4.2` to
  `0.5.0`
- WHEN the release PR diff is inspected
- THEN `versionCode`/`buildNumber` (or their EAS-remote equivalents) are
  unchanged by that PR

#### Scenario: An EAS build increments versionCode/buildNumber without touching version

- GIVEN an EAS build triggered for `mobile-v0.5.0`
- WHEN the build completes and increments the remote version counter
- THEN `app.json > version` in the repo is unchanged by that EAS run

## Non-Goals

- `runtimeVersion` / expo-updates OTA behavior.
- npm publishing behavior (all packages stay `private:true`).
- App-store / TestFlight / Play Store submission automation (ADR-022, stays
  manual).
- Rewriting or re-tagging existing git history (the `mvp-v1` tag is
  untouched; components bootstrap fresh at 0.x).
- Exact release-please config field values, workflow YAML, or `vercel.json`
  contents — those are design/tasks detail, not spec-level behavior.
