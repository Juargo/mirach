# Perfil Usuario Specification

## Purpose

Self-service profile editing for the session's own user: read `nombre` (via `AUTH-09`), update
`nombre`/`email` with the encrypted-column + blind-index invariant intact, and change the password
with current-password re-verification and other-session revocation. All mutations are self-scoped and
demo-gated. Requirement family `PERF040-*`.

## Requirements

### Requirement: PERF040-01 — Updating nombre and/or email

`PATCH /api/perfil` MUST accept `nombre` and/or `email`, with at least one present, and MUST update
only the field(s) supplied. A `nombre`-only request MUST leave `email` and `emailBlindIndex`
untouched — it MUST NOT require `passwordActual` and MUST NOT recompute either email column.

#### Scenario: Nombre-only edit does not touch email columns

- GIVEN an authenticated session, no `passwordActual` supplied
- WHEN the caller sends `PATCH /api/perfil` with only `nombre`
- THEN the response is `200` with the updated `nombre`
- AND the stored `email` ciphertext and `emailBlindIndex` are byte-identical to before the request

#### Scenario: Nombre and email updated together

- GIVEN an authenticated session with the correct `passwordActual`
- WHEN the caller sends `PATCH /api/perfil` with both `nombre` and a new `email`
- THEN the response is `200` reflecting both new values
- AND `GET /api/auth/me` reflects both afterward

#### Scenario: Empty or over-long nombre is rejected before any write

- GIVEN an authenticated session
- WHEN the caller sends `PATCH /api/perfil` with `nombre` that is empty (after trim) or longer than
  80 characters
- THEN the response is `400` with a code identifying the validation failure
- AND the stored `nombre` is unchanged

### Requirement: PERF040-02 — Email write invariant: one normalization, one atomic update

When `email` changes, the ciphertext and `emailBlindIndex` MUST be derived from the same normalized
`Email` value and written in a single atomic update. No intermediate state where the two derive from
different raw strings, or where one column is updated without the other, MUST ever be observable.

#### Scenario: Login proves the invariant end to end

- GIVEN a user logged in with their current email
- WHEN they successfully change their email via `PATCH /api/perfil`
- THEN logging in with the NEW email succeeds
- AND logging in with the OLD email fails with the standard invalid-credentials response

#### Scenario: A failed email change leaves the account log-in-able

- GIVEN a user with a working email/password pair
- WHEN an email-change attempt fails for any reason (validation, conflict, current-password mismatch)
- THEN neither the ciphertext nor the blind index changes
- AND the user can still log in with their original email

### Requirement: PERF040-03 — Current password required for password AND email changes

`PATCH /api/perfil` MUST require `passwordActual` whenever `email` is present in the request, and
`PATCH /api/perfil/password` MUST always require it. A wrong `passwordActual` MUST reject the request
with a generic error that does not reveal whether the failure was the password itself or any other
cause, and MUST NOT write any field.

#### Scenario: Wrong current password blocks an email change

- GIVEN an authenticated session
- WHEN the caller sends `PATCH /api/perfil` with a new `email` and an incorrect `passwordActual`
- THEN the response is the generic rejection (403, `PERFIL_RECHAZADO`)
- AND the stored email, ciphertext and blind index are unchanged

#### Scenario: Wrong current password blocks a password change

- GIVEN an authenticated session
- WHEN the caller sends `PATCH /api/perfil/password` with an incorrect `passwordActual`
- THEN the response is the generic rejection (403, `PERFIL_RECHAZADO`)
- AND `passwordHash` is unchanged and no session is revoked

### Requirement: PERF040-04 — Anti-enumeration: shared generic error

An email already claimed by another account MUST return the exact same response (status, code, and
message) as a wrong `passwordActual` (PERF040-03). A caller MUST NOT be able to distinguish "this
email is taken" from "you typed your password wrong" from the response alone.

#### Scenario: Email already in use is indistinguishable from a wrong password

- GIVEN user B already owns the email `taken@example.com`
- WHEN user A sends `PATCH /api/perfil` with `email: "taken@example.com"` and their own correct
  `passwordActual`
- THEN the response is byte-identical to PERF040-03's wrong-password response
- AND user B's account (email, ciphertext, blind index) is untouched

### Requirement: PERF040-05 — New password validated and stored hashed

`PATCH /api/perfil/password` MUST validate `passwordNueva` against the domain password rules before
storing it, and MUST store it using the same hashing scheme as login credential storage. The stored
value MUST NOT ever be the plaintext password.

#### Scenario: Valid new password can log in afterward

- GIVEN a valid current password and a new password that passes domain validation
- WHEN the caller sends `PATCH /api/perfil/password`
- THEN the response is `204`
- AND a subsequent login with the new password succeeds; the stored value is a hash, never plaintext

#### Scenario: Invalid new password is rejected before any write

- GIVEN a valid current password and a `passwordNueva` that fails domain validation (e.g. too short)
- WHEN the caller sends `PATCH /api/perfil/password`
- THEN the response is `400` with a code identifying the validation failure
- AND `passwordHash` is unchanged

### Requirement: PERF040-06 — Password change revokes other sessions, keeps the caller's

A successful password change MUST revoke every OTHER active session belonging to that user, and MUST
leave the session that performed the change valid.

#### Scenario: Other session is rejected, caller's keeps working

- GIVEN a user with two active sessions, A and B
- WHEN session A successfully changes the password via `PATCH /api/perfil/password`
- THEN subsequent requests using session B are rejected as unauthenticated
- AND subsequent requests using session A continue to succeed

### Requirement: PERF040-07 — Self-scoped mutations only

Both `PATCH /api/perfil` and `PATCH /api/perfil/password` MUST operate exclusively on the requesting
session's own user. No field in either request body MUST be capable of targeting a different user's
row.

#### Scenario: No field can redirect the mutation to another user

- GIVEN user A's authenticated session
- WHEN user A sends a profile or password request with any extra field naming another user's id
- THEN the mutation applies only to user A's row
- AND the named other user's row is unaffected

### Requirement: PERF040-08 — Demo sessions cannot mutate the profile

Every profile mutation (`PATCH /api/perfil`, `PATCH /api/perfil/password`) MUST refuse a demo session
with `403` and a demo-read-only code, with guidance to register a real account, and MUST NOT write
anything.

#### Scenario: Demo session is refused on every mutation

- GIVEN a demo session
- WHEN it calls `PATCH /api/perfil` or `PATCH /api/perfil/password` with an otherwise valid body
- THEN the response is `403` with the demo-read-only code and register guidance
- AND no field (`nombre`, `email`, `emailBlindIndex`, `passwordHash`) changes

### Requirement: PERF040-09 — Contract stays in sync

The OpenAPI document and the generated `@moneydiary/api-client` types MUST describe both endpoints,
including their error responses, and MUST pass the existing CI drift gates.

#### Scenario: Regenerated contract passes drift checks

- GIVEN the two endpoints implemented per PERF040-01 through PERF040-08
- WHEN `openapi.json` and the api-client types are regenerated
- THEN the CI drift gates for both artifacts report no difference

## Non-Goals

- Any `apps/web` or `apps/mobile` UI — US-042 consumes this contract; US-040 is API-only.
- Linking/unlinking Google identity — US-041.
- Password recovery/reset by email, and verification of a new email before it becomes active —
  deferred; the current-password requirement (PERF040-03) is the safeguard shipped now.
- Rate limiting the current-password check beyond the existing `x-api-key` + session gate.
- A dedicated `GET /api/perfil` — `nombre` is added to the existing `/api/auth/me` identity instead.
