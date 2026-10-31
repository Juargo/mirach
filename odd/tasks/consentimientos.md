# Versioned consents (#112)

Objective: store versioned consents, require terms at signup and the statement consent to import, behind a flag that stays off until #134 ships.
Branch: `feat/consentimientos` from `94087d4`. Delivery: `ask-on-risk`. Test runner: vitest (`pnpm api test`, `pnpm api test:integration`, `pnpm api test:e2e`).

## Specs

- S1. "Tabla `Consentimiento` (tipo, versión, aceptado en, revocado en) con `userId`."
- S2. "Los endpoints de token de Apple y Google reciben la versión de términos y privacidad aceptada y la guardan en la misma transacción que crea la cuenta. Sin ella, no se crea la cuenta (usuario existente: no se exige de nuevo)."
- S3. "`GET/POST /api/consentimientos`; `DELETE` para revocar (PRI-06 queda para después, pero el modelo lo soporta)."
- S4. "`POST /api/ingestas/preview` responde `409 CONSENTIMIENTO_CARTOLAS_REQUERIDO` sin consentimiento vigente."
- S5. "Los consentimientos se borran con la cuenta."
- S6. Scenario, verbatim: "Dado que Marcela no aceptó el procesamiento de cartolas / Cuando sube una cartola / Entonces recibe 409 CONSENTIMIENTO_CARTOLAS_REQUERIDO y no se lee el archivo".
- S7. User decision (L2): the API stores consents from now on, and enforcement of S2 and S4 sits behind an environment flag that is off in production until #134 is published and is the minimum version.
- S8. Definition of done (ADR-010 §7): acceptance scenarios pass, tests at the lowest layer, isolation test for user data, `openapi:emit`, both clients regenerated, no incompatible `oasdiff` change, CI green, logs without personal data.

Assumptions, decided by the parent:

- A1. Besides preview, the gate covers `POST /api/ingestas` and `POST /api/ingestas/commit`: S6 says "sube una cartola", and leaving them open would bypass the rule.
- A2. A signup rejected for missing terms takes the generic 401 of the token endpoints (no enumeration, ADR-006).
- A3. A malformed version is rejected at signup even with the flag off; a logged-in existing user is never affected.
- A4. Accepting again with another version revokes the previous row and inserts a new one, so the history is kept and at most one row per type is in force.
- A5. The API does not compare versions with a "current" one: no such catalog exists.

## Tasks

- [x] T1 (S1, S5) domain, migration with RLS, repository, account deletion. Route: inline. Commit: 7c25a04.
- [x] T2 (S2, S7) signup with terms on both token endpoints. Route: inline. Commit: e75f61a.
- [x] T3 (S3) `GET/POST/DELETE /api/consentimientos`. Route: inline. Commit: d47d633.
- [x] T4 (S4, S6, S7) import gate before the file is read. Route: inline. Commit: d47d633.
- [x] T5 (S8) contract, clients, docs. Route: inline.

Route evidence: no Writer trigger. The units depend on each other, so they are not parallel.

## Log

- L1 (2026-10-30, user): "continuemos el sprint". Next critical-path issue: #112.
- L2 (2026-10-30, user): picked "Con flag (Recomendado)": the requirement stays behind an environment variable, off in production, until #134 is published and is the minimum version.
- L3: Risk items 2 (auth signup) and 3 (contract of token endpoints). Independent verifier at the end. Migration must be applied to production before merge (root `CLAUDE.md`).
- L4: T3 and T4 share one commit: the e2e spec and the wiring cover both. The 409 keeps the `IngestaCatalogoIncompletoResponse` schema and widens its `code` enum, because a `oneOf` response is harder on the Kotlin generator. Mutations caught: gate removed from commit, `userId` removed from `revocar`.
- L5: `.env.test` is absent locally and `.env*` writes are restricted; local test variables are exported from a scratchpad file. Exporting them breaks `seed-catalog.spec.ts` in the unit run, so the unit suite runs without them.
- L6: Independent verifier: S1-S7 pass, no blockers. S8 partial for the verifier; the parent ran client generation, iOS and Android builds and `env:example:check`. `oasdiff` is not available and is not in CI (#117). Advisory fixed: a non-string version on the Apple endpoint rejected existing users; both routes now normalize with `versionDe`. `.catch('')` was discarded because it emits `"default": ""` into the contract.
