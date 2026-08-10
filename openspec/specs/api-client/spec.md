# API Client Package Specification

## Purpose

Establishes `packages/api-client` (`@moneydiary/api-client`) as the monorepo's first shared workspace
package: a **types-only** derivation of the HTTP contract already emitted at `apps/api/openapi.json`
(ADR-011). It exists so both frontends stop hand-copying DTO shapes and instead depend on a single,
mechanically-regenerated source that fails the build on drift. This is the first slice of ADR-012 (Option
B) — no runtime client, no `TokenStorage`, no `errors.ts` ship here (see Non-Goals).

## Requirements

### Requirement: AC-01 — Package Identity and Workspace Membership

`packages/api-client` MUST exist as a pnpm workspace member named `@moneydiary/api-client`, resolvable by
both `apps/web` and `apps/mobile` via an explicit `workspace:*` dependency declared in each app's own
`package.json` (pnpm isolated resolution does not hoist it).

#### Scenario: Package resolves as a workspace member

- GIVEN `pnpm-workspace.yaml` lists `packages/*`
- WHEN `pnpm install` runs at the repo root
- THEN `@moneydiary/api-client` is linked into both `apps/web/node_modules` and `apps/mobile/node_modules`
  via pnpm's symlink mechanism

#### Scenario: Package contains no runtime code

- GIVEN the package's published surface (`src/index.ts` and its exports)
- WHEN its contents are inspected
- THEN it exports only TypeScript types (`paths`, `components`) — no functions, no classes, no values
  callable at runtime, no DOM or React Native API usage

### Requirement: AC-02 — Types Are Generated From the Committed Contract

`packages/api-client` MUST derive `src/types.gen.ts` from `apps/api/openapi.json` via a generate script,
never by hand-editing the generated file.

#### Scenario: Generate script reads the committed contract

- GIVEN `apps/api/openapi.json` is the committed, drift-checked contract (per the `openapi-contract` spec)
- WHEN `pnpm --filter @moneydiary/api-client generate` runs
- THEN `src/types.gen.ts` is (re)written from that file's current content, with no other input

### Requirement: AC-03 — Deterministic, Committed Generation With a CI Drift Gate

Generation MUST be deterministic: re-running it against an unchanged `apps/api/openapi.json` MUST produce
a byte-identical `src/types.gen.ts`. The generated file MUST be committed to the repository (not
gitignored), and CI MUST fail when the committed file diverges from what a fresh generation produces —
mirroring the existing `openapi:check` drift gate for `apps/api/openapi.json`.

#### Scenario: Re-generating with no contract changes is a no-op diff

- GIVEN the committed `src/types.gen.ts` matches the current `apps/api/openapi.json`
- WHEN the generate script runs again with no contract change
- THEN `git diff` on `src/types.gen.ts` is empty

#### Scenario: Contract changed without regenerating fails CI

- GIVEN a PR changes `apps/api/openapi.json` (a schema/route change) without regenerating
  `src/types.gen.ts`
- WHEN CI regenerates and runs `git diff --exit-code` against the committed file
- THEN the diff is non-empty and the build fails

#### Scenario: Contract regenerated correctly passes CI

- GIVEN a PR changes `apps/api/openapi.json` and regenerates `src/types.gen.ts` in the same commit
- WHEN CI regenerates and diffs
- THEN the diff is empty and the build passes

### Requirement: AC-04 — Money Fields Stay String-Typed at the Type Level

Generated types for money-bearing fields (`cargo`, `abono`, `total`, `totalIngreso`, and any other field
the source schema declares as a decimal-string amount) MUST resolve to the TypeScript type `string`, never
`number`. This MUST be assertable by a compile-time check that fails the build if a field's generated type
stops being `string`.

#### Scenario: Generated type for `cargo`/`abono` is `string`

- GIVEN `apps/api/openapi.json` declares `cargo` and `abono` as `type: string` (decimal-string amounts)
- WHEN `src/types.gen.ts` is generated
- THEN the corresponding generated type resolves `cargo` and `abono` to `string`, verifiable by a
  type-level test (e.g. an `Equal<...>`/`expectTypeOf`-style compile-time assertion) that fails to compile
  if either field's generated type is ever `number`

### Requirement: AC-05 — Build-Less Package Surface

The package MUST NOT require a build step to be consumed. `package.json`'s `types`/`exports` fields MUST
point directly at TypeScript source (`src/index.ts`), so each consumer's own compiler (`tsc` for web,
Metro's TypeScript handling for mobile) resolves the types without an intermediate compiled artifact.

#### Scenario: Consumer typechecks without a package build step

- GIVEN `@moneydiary/api-client` has never been built (no `dist/`, no bundler output)
- WHEN `apps/web` or `apps/mobile` runs its own typecheck
- THEN the package's types resolve successfully directly from `src/`

### Requirement: AC-06 — Package-Only Changes Trigger CI

A commit that touches only `packages/**` MUST trigger CI jobs for the web and mobile workspaces (in
addition to any dedicated `packages` job), so a generated-type change that breaks a consumer's typecheck
is caught before merge.

#### Scenario: A `packages/api-client` change alone runs the web and mobile jobs

- GIVEN a commit modifies only files under `packages/api-client/`
- WHEN CI evaluates its path filters
- THEN the `web` and `mobile` CI jobs run (not skipped), in addition to any `packages` job

## Non-Goals

| Excluded | Reason |
|----------|--------|
| `client.ts` (openapi-fetch, interceptors) | Deferred; a future slice once workspace/CI/Metro mechanics are proven |
| `TokenStorage` port + DI wiring | Deferred; mobile is the natural first adopter in a later slice |
| Unified `errors.ts` taxonomy | Deferred; requires reconciling web's and mobile's `ApiError` unions, a product-facing decision |
| `tsup` / any build step | Explicitly out — a types-only package needs none |
| npm publication / independent release-please entry | Internal `workspace:*` only |
| Runtime validation of API responses | Generated types are compile-time only; runtime money-safety guards stay in each app |
