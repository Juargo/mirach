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

### Requirement: AC-06 — SessionGuard is layered after ApiKeyGuard, for either transport

(Previously: cookie-only. Revised: enforcement is transport-agnostic — see `user-authentication` AUTH-05 for the cookie-or-Bearer precedence rule.)

The system MUST register a second global guard, `SessionGuard`, running after `ApiKeyGuard`. Both guards MUST pass (AND semantics) for a request to reach a protected controller; `SessionGuard` does not replace `ApiKeyGuard`. This applies identically to web (cookie) and mobile (`Authorization: Bearer`) clients — `SessionGuard` enforcement is global across all data endpoints regardless of which transport carries the session token.

#### Scenario: Valid key but no session (either transport) is rejected

- GIVEN a request to a protected endpoint with a valid `x-api-key` but no session cookie and no `Authorization: Bearer` header
- WHEN the request is processed
- THEN the response status is 401

#### Scenario: Valid key and valid cookie session is authorized

- GIVEN a request to a protected endpoint with a valid `x-api-key` and a valid, unexpired, non-revoked session cookie
- WHEN the request is processed
- THEN the request is authorized by both guards

#### Scenario: Valid key and valid Bearer session is authorized

- GIVEN a request to a protected endpoint with a valid `x-api-key` and a valid, unexpired, non-revoked `Authorization: Bearer` token
- WHEN the request is processed
- THEN the request is authorized by both guards, identically to the cookie case

### Requirement: AC-07 — Login is reachable through the api-key layer without an existing session, for both clients

`POST /api/auth/login` MUST remain subject to `ApiKeyGuard` (requires a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), via a dedicated marker distinct from the general `@Public()` bypass. This holds for both web and mobile clients — login is api-key-only, session-free, on every platform.

#### Scenario: Login succeeds with a valid api-key and no session

- GIVEN a client (web or mobile) with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it sends `POST /api/auth/login` with valid credentials
- THEN the request reaches the login handler and is not rejected by `SessionGuard`

#### Scenario: Login without an api-key is still rejected

- GIVEN a client with no `x-api-key`
- WHEN it sends `POST /api/auth/login`
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

### Requirement: AC-08 — Health endpoint stays public to both guards

`GET /` MUST remain exempt from both `ApiKeyGuard` and `SessionGuard`.

#### Scenario: Health check succeeds with neither key nor session

- GIVEN a client with no `x-api-key` and no session cookie
- WHEN it sends `GET /`
- THEN the response status is 200

### Requirement: AC-09 — Google login endpoints are session-public, api-key required

`GET /api/auth/google` and `GET /api/auth/google/callback` MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login` and `demo` (AC-07). This holds regardless of whether the request arrives directly at the API or through the web's same-origin proxy (which injects `x-api-key` server-side, per the existing demo-flow precedent).

#### Scenario: Initiate is reachable with a valid api-key and no session

- GIVEN a top-level navigation with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `GET /api/auth/google`
- THEN the request reaches the Google-login handler and is not rejected by `SessionGuard`

#### Scenario: Initiate without an api-key is rejected

- GIVEN a request to `GET /api/auth/google` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

#### Scenario: Callback is reachable with a valid api-key and no session

- GIVEN Google's redirect lands on `GET /api/auth/google/callback` through the web's same-origin proxy (which injects `x-api-key` server-side) with no prior session
- WHEN the request is processed
- THEN the request reaches the Google-callback handler and is not rejected by `SessionGuard`

### Requirement: AC-10 — Capability discovery endpoint is session-public, api-key required, always mounted

`GET /api/auth/capabilities` (see design §4.5) MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login`, `demo`, and the Google login endpoints (AC-07, AC-09). Unlike `/api/auth/google` and `/api/auth/google/callback`, this route MUST be mounted unconditionally regardless of whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are configured — its purpose is precisely to let clients discover that activation state before rendering any Google-login affordance. The response body MUST be exactly `{ "googleLoginEnabled": boolean }`, where the value is `true` when both Google credentials are present (`container.googleAuth !== undefined`) and `false` otherwise.

#### Scenario: Capabilities is reachable with a valid api-key and no session

- GIVEN a request with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `GET /api/auth/capabilities`
- THEN the request reaches the capabilities handler and is not rejected by `SessionGuard`

#### Scenario: Capabilities without an api-key is rejected

- GIVEN a request to `GET /api/auth/capabilities` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

#### Scenario: Capabilities reports true when Google login is configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response status is 200 with body `{ "googleLoginEnabled": true }`

#### Scenario: Capabilities reports false when Google login is not configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both absent at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response status is 200 with body `{ "googleLoginEnabled": false }`, and `GET /api/auth/google` and `GET /api/auth/google/callback` both return 404 (AC-09 is unaffected — the endpoint is exempt from `SessionGuard`, not from the feature's activation gate)
