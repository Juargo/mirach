# API Access Control Specification

## Purpose

Defines the deployed-access contract for `apps/api` on Render: which routes are public, which require the API key, and how the deployment is verified end-to-end (ADR-015 access-control emphasis).

## Requirements

### Requirement: AC-01 — Health endpoint is public

The system MUST expose `GET /` without requiring `x-api-key` and MUST return HTTP 200.

#### Scenario: Health check succeeds without a key

- GIVEN the deployed API on Render
- WHEN a client sends `GET /` with no `x-api-key` header
- THEN the response status is 200

### Requirement: AC-02 — Resumen endpoint rejects missing/invalid key

`GET /api/resumen` MUST be guarded by `ApiKeyGuard` (global `APP_GUARD`) and MUST reject requests without a valid `x-api-key`.

#### Scenario: Request without the header is rejected

- GIVEN the deployed API on Render
- WHEN a client sends `GET /api/resumen?periodo=2026-07` with no `x-api-key` header
- THEN the response status is 401
- AND no resumen data is returned

#### Scenario: Request with an invalid key is rejected

- GIVEN the deployed API on Render
- WHEN a client sends `GET /api/resumen?periodo=2026-07` with `x-api-key: wrong-value`
- THEN the response status is 401

### Requirement: AC-03 — Resumen endpoint accepts a valid key

#### Scenario: Request with the correct key succeeds

- GIVEN the deployed API on Render with `API_KEY` set in the environment
- WHEN a client sends `GET /api/resumen?periodo=2026-07` with `x-api-key: <API_KEY>`
- THEN the response status is 200
- AND the body is JSON matching `ResumenMesDto`

### Requirement: AC-04 — Controller documentation matches actual guard behavior

`resumen.controller.ts` MUST NOT state the endpoint is unauthenticated; its docstring MUST reflect that `ApiKeyGuard` is a global guard protecting the route.

#### Scenario: Docstring reviewed against code

- GIVEN `resumen.controller.ts`
- WHEN the docstring is read
- THEN it does not claim the endpoint is "intentionally unauthenticated"
- AND it states the endpoint is protected by the global `ApiKeyGuard`

### Requirement: AC-05 — Deploy verification runbook passes on the live URL

The A.3/A.4 curl matrix (health public / resumen no-key 401 / resumen with-key 200) MUST be executed against the actual Render URL as acceptance evidence, not only locally.

#### Scenario: Runbook curl matrix executed against Render

- GIVEN `apps/api` deployed to Render per `render.yaml` with `DATABASE_URL`, `DIRECT_URL`, `API_KEY` loaded
- WHEN the three curl checks in `docs/mobile-launch-runbook.md` are run against the Render URL
- THEN all three return the expected status (200 / 401 / 200+JSON)
