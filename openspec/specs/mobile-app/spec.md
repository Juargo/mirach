# Mobile App API Types Specification

## Purpose

Replaces the hand-written DTO type declarations across `apps/mobile/src/api/{client,post-ingesta,
preview-ingesta}.ts` with type aliases derived from `@moneydiary/api-client`'s generated types, for every
endpoint the package's contract covers, and guarantees the package is resolved by `tsc` only — never by
Metro/jest-expo at runtime. No fetch logic, error handling, timeout wrapping, or validation guard changes.

## Requirements

### Requirement: MAC-01 — DTO Types Are Derived, Not Hand-Written

For every endpoint covered by `apps/api/openapi.json` (see `api-client` spec), the DTO
shapes declared in `apps/mobile/src/api/client.ts`, `preview-ingesta.ts`, and
`commit-ingesta.ts` MUST be type aliases over `@moneydiary/api-client`'s generated
`components['schemas'][...]` types, not independently hand-written declarations.
`post-ingesta.ts` and its hand-written DTOs are removed by this change
(`cartola-preview-confirmacion`) — its endpoint (`POST /api/ingestas`) has no shipped
mobile caller after this change (see `ingesta-preview-commit` spec, DEP-01) — so this
requirement no longer applies to it.

(Previously: covered `client.ts`, `post-ingesta.ts`, and `preview-ingesta.ts`.)

#### Scenario: No hand-written DTO type remains for a covered endpoint

- GIVEN `ResumenMesDto` (or `LoginResponseDto`, `MeDto`, `AuthCapabilitiesDto`) is
  covered by `apps/api/openapi.json`
- WHEN the relevant mobile `src/api/*.ts` file is inspected after migration
- THEN that type is declared as an alias over `@moneydiary/api-client`'s generated
  `components['schemas'][...]`, not as a hand-written declaration

#### Scenario: Mobile typecheck and test suite pass using the derived types

- GIVEN mobile's DTO subset has been migrated for all endpoints covered by the contract
- WHEN `tsc --noEmit` and `pnpm --filter @moneydiary/mobile test` run
- THEN both pass with zero failures attributable to the migration

#### Scenario: The new commit client is derived from generated types, not hand-written

- GIVEN `commit-ingesta.ts` is authored as part of `cartola-preview-confirmacion`
- WHEN its request/response DTO types are inspected
- THEN they are type aliases over `@moneydiary/api-client`'s generated
  `components['schemas'][...]` types, not hand-written declarations

#### Scenario: `post-ingesta.ts` no longer exists after this change

- GIVEN the mobile source tree after `cartola-preview-confirmacion`
- WHEN `apps/mobile/src/api/post-ingesta.ts` is looked up
- THEN the file does not exist and no import references it
### Requirement: MAC-02 — Type Erasure Guarantee (`verbatimModuleSyntax`)

`apps/mobile/tsconfig.json` MUST set `verbatimModuleSyntax: true`. All imports of
`@moneydiary/api-client` types MUST use the `import type { ... }` statement form, so the import is erased
before Metro bundles the app — Metro and jest-expo MUST NEVER attempt to resolve
`@moneydiary/api-client` as a runtime module.

#### Scenario: `verbatimModuleSyntax` is set

- GIVEN `apps/mobile/tsconfig.json` after this migration
- WHEN its compiler options are inspected
- THEN `verbatimModuleSyntax` is `true`

#### Scenario: Type-only imports are erased before bundling

- GIVEN `apps/mobile/src/api/client.ts` imports a type from `@moneydiary/api-client` using
  `import type { ... }`
- WHEN the Metro bundle (dev/EAS build) or the `jest-expo` test run executes
- THEN neither process attempts to resolve `@moneydiary/api-client` as a runtime module — the import
  contributes zero bytes and zero module-resolution calls to the bundle or test run

### Requirement: MAC-03 — Runtime Guards and Error Handling Are Unchanged

Every runtime type guard in mobile's `src/api/*.ts` (`esResumenMesDto`, `esLoginResponseDto`,
`esAuthCapabilitiesDto`, `esMeDto`), the `ApiError` discriminated union
(`unauthorized | network | parse | http`), and the `conTimeout` network-leg wrapper MUST remain
behaviorally identical after this migration. Only the type declarations these guards check against may
change (from hand-written to generated).

#### Scenario: A guard-behavior test still passes unchanged

- GIVEN an existing unit test asserting `esResumenMesDto` rejects a payload where `totalIngreso` is not a
  string
- WHEN that test runs after the type-source migration, with no edits to the test itself
- THEN it passes exactly as it did before the migration

#### Scenario: `ApiError` taxonomy and `conTimeout` are untouched

- GIVEN the current `ApiError` union has four tags (`unauthorized | network | parse | http`) and
  `conTimeout` wraps network legs with `NETWORK_LEG_TIMEOUT_MS`
- WHEN the migration diff is inspected
- THEN no edit touches the `ApiError` type definition, its tags, the functions that construct each
  variant, or `conTimeout`'s implementation

## Non-Goals

| Excluded | Reason |
|----------|--------|
| Any change to mobile's fetch/session logic (`session-store.ts`, `session-context.tsx`) | Out of scope — runtime code is untouched |
| `TokenStorage` port adoption | Deferred to a future slice |
| Google sign-in flow (`use-google-id-token.ts`) | Orthogonal — talks to Google's OIDC endpoints directly, not this package |
| Endpoints not yet in `apps/api/openapi.json` | Stay hand-written until the contract covers them |
