# Mobile Session Auth Specification

## Purpose

Defines mobile-client (`apps/mobile`, Expo) behavior for real per-user session auth, reusing the same `Session` model, SHA-256 opaque token, and validation path defined in `user-authentication` — transported as `Authorization: Bearer <token>` instead of a cookie (React Native cannot reliably use HttpOnly browser cookies). Mobile keeps its existing `x-api-key` header unchanged; the session is an additional, required layer. Register/signup on mobile is an explicit non-goal (deferred, same as web).

## Requirements

### Requirement: MOB-01 — Mobile presents a login screen and stores the session token in SecureStore

On successful `POST /api/auth/login`, the mobile app MUST read the raw token from the response body and persist it in Expo SecureStore. It MUST NOT persist the token in unencrypted storage (e.g. AsyncStorage, plain JS state that survives app restarts).

#### Scenario: Successful login stores the token

- GIVEN a user enters valid credentials on the mobile login screen
- WHEN the login request succeeds
- THEN the mobile app stores the returned token in Expo SecureStore
- AND navigates to the resumen screen

#### Scenario: Failed login shows an error and stores nothing

- GIVEN a user enters invalid credentials
- WHEN the login request fails
- THEN the mobile app shows a generic error message
- AND no token is written to SecureStore

### Requirement: MOB-02 — Authenticated requests carry the session as a Bearer token alongside the api-key

The mobile HTTP client MUST send `Authorization: Bearer <token>` (read from SecureStore) on every authenticated request, in addition to the existing `x-api-key` header. `GET /api/resumen` MUST include both headers once a session exists.

#### Scenario: fetchResumen carries both headers

- GIVEN a valid token is stored in SecureStore
- WHEN the mobile app calls `GET /api/resumen`
- THEN the request includes `x-api-key` and `Authorization: Bearer <token>`
- AND the returned data is scoped to the session's `userId`

### Requirement: MOB-03 — No stored token, or an expired/revoked one, routes to the login screen

If SecureStore has no token, or a request using the stored token returns 401, the mobile app MUST clear SecureStore (if a token was present) and show the login screen. This is the mobile analogue of AUTH-10's web redirect.

#### Scenario: No stored token on app start

- GIVEN SecureStore has no session token
- WHEN the app launches
- THEN the mobile app shows the login screen instead of calling `/api/resumen`

#### Scenario: Stored token is rejected (expired or revoked)

- GIVEN SecureStore has a token that the backend rejects with 401
- WHEN the mobile app calls `GET /api/resumen`
- THEN the app clears the stored token
- AND shows the login screen

### Requirement: MOB-04 — Logout clears the stored token

Logging out on mobile MUST clear the SecureStore token and MUST call `POST /api/auth/logout` so the corresponding `Session` row is revoked server-side.

#### Scenario: Logout clears local and server state

- GIVEN a valid stored token
- WHEN the user logs out
- THEN SecureStore no longer holds the token
- AND the corresponding session row is revoked (subsequent use of the old token returns 401)

### Requirement: MOB-05 — Mobile Google sign-in issues a Bearer session, mechanism-agnostic

Completing Google sign-in on mobile, regardless of the native flow chosen at design time, MUST result in the same client-observable outcome as password login (MOB-01/MOB-02): a session token — issued through the identity-resolution path defined by `user-authentication` AUTH-14 and the session-issuance path defined by AUTH-13 — persisted in Expo SecureStore, and sent as `Authorization: Bearer <token>` on subsequent requests. Demo accounts remain excluded per AUTH-14 — mobile Google sign-in MUST NOT authenticate or create a session for a demo account. On any failure (no matching account, unverified email, cancelled/denied consent), the mobile app MUST show the same generic error used elsewhere in the Google flow (AUTH-15) and MUST NOT persist any token.

This requirement does not pin: the API surface used to complete the exchange, the deep-link or token-exchange mechanism, or the `aud` validation strategy for a mobile-issued `id_token`/code — those are design decisions.

#### Scenario: Successful Google sign-in stores a Bearer token like password login

- GIVEN a user completes Google sign-in on mobile and it resolves to an existing, non-demo user (AUTH-14)
- WHEN the flow completes
- THEN the mobile app stores a session token in Expo SecureStore
- AND subsequent requests carry `Authorization: Bearer <token>` alongside `x-api-key`, identically to a password-login session (MOB-02)

#### Scenario: Failed Google sign-in shows a generic error and stores nothing

- GIVEN a Google identity on mobile that resolves to no existing account (AUTH-14)
- WHEN the flow completes
- THEN the mobile app shows the same generic error used for other Google-flow failures
- AND no token is written to SecureStore

#### Scenario: Demo mode is not reachable via Google sign-in

- GIVEN a Google identity that would otherwise match a demo account
- WHEN the flow completes on mobile
- THEN no session is issued and no token is stored, per AUTH-14's demo-exclusion rule
