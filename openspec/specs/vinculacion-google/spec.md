# vinculacion-google Specification

**Scope of this capability.** `POST /api/perfil/google/vincular` and
`POST /api/perfil/google/desvincular` live under `/api/perfil` and reuse `perfil-usuario`'s demo gate
and generic-rejection error, but they are requirements about a **Google identity**, not about
`nombre`/`email`/password. The callback route and the identity read are owned by
`user-authentication` (AUTH-09, AUTH-12, AUTH-14), which describes the callback's two modes. The
signed link-intent, the ★ no-re-link rule on the explicit path, the never-passwordless invariant and
both endpoints live here. Requirement family `VINC041-*`.

## Purpose

Let an authenticated, non-demo, password-re-verified user explicitly link or unlink a Google identity
from their own profile — on top of the *implicit*, email-matched link that `user-authentication`'s
Google login flow (AUTH-14) already performs during login. The explicit link is bound to the caller's
`userId`, never to an email match. Because the callback that resolves the link has no session by
construction, the target account travels through the OAuth round trip as a signed claim, not a session
lookup. No Google token is ever persisted, and no account can ever be left without an access method.

## Requirements

### Requirement: VINC041-01 — Link initiation is session-gated, demo-gated, and password-verified

`POST /api/perfil/google/vincular` MUST require an authenticated, non-demo session and MUST require
and verify the caller's current password before starting the OIDC flow. On success it MUST respond
`200 { urlAutorizacion }` and MUST set a cookie carrying a link intent that the callback can later
verify (see VINC041-03). No field in the request body MUST be capable of naming a different user's
account — the target is always the requesting session's own user.

#### Scenario: Correct current password starts the flow

- GIVEN an authenticated, non-demo session with a known correct password
- WHEN the caller sends `POST /api/perfil/google/vincular` with the correct `passwordActual`
- THEN the response is `200` with `urlAutorizacion`
- AND the response sets a cookie carrying a link intent scoped to the caller's own `userId`

### Requirement: VINC041-02 — Link happy path resolves to the caller's own account (CA-01)

Completing the OIDC round trip after a successful initiation (VINC041-01) with a Google identity not
already linked to any account MUST result in that `googleSub` being set on the initiating user's own
account, and MUST NOT persist any Google token anywhere. Completing the round trip again with the same
Google identity already linked to the caller MUST succeed idempotently — it MUST NOT be treated as an
error.

#### Scenario: Full round trip links the caller's own account

- GIVEN an authenticated, non-demo session with the correct current password, and no existing
  `googleSub` on the account
- WHEN the caller initiates linking (VINC041-01) and completes the OIDC round trip with a Google
  identity that is not linked to any account
- THEN the caller's account now has that `googleSub` set
- AND no `access_token`, `refresh_token`, or `id_token` is stored anywhere for the account

#### Scenario: Re-linking the same identity is idempotent

- GIVEN an account whose `googleSub` is already set to a given identity
- WHEN the caller repeats the link flow to completion with that same Google identity
- THEN the outcome is success and the account's `googleSub` is unchanged
- AND this is not reported or logged as an error

### Requirement: VINC041-03 — The link-intent must be unforgeable across the OIDC round trip

Because the session cookie is withheld by the browser on the cross-site redirect back from Google, the
callback has no session by construction. The account a link targets MUST travel inside the OAuth
cookie as a claim signed with a purpose-separated key, computed over the flow's own `state` and the
target `userId`, and the callback MUST verify that signature with a constant-time comparison before
treating any link marker as trustworthy. A link marker that is missing a valid signature, whose
signature does not verify against the current `state`, or whose signature was produced for a different
flow MUST cause the callback to write nothing to any account and to fail exactly as any other callback
failure fails — the same generic outcome, no distinguishing code. It MUST NOT fall back to the
implicit, email-matched login/link path (AUTH-14) under any of these conditions.

#### Scenario: Tampered userId in the link marker writes nothing

- GIVEN a link cookie whose signed `userId` has been altered after issuance
- WHEN the callback completes an otherwise-valid OIDC exchange
- THEN no account's `googleSub` changes
- AND the response is the same generic failure outcome as any other callback failure

#### Scenario: Missing or malformed signature writes nothing

- GIVEN a link marker present in the cookie but carrying no valid signature, or a signature that fails
  shape validation
- WHEN the callback completes an otherwise-valid OIDC exchange
- THEN no account's `googleSub` changes
- AND the response is the same generic failure outcome as any other callback failure

#### Scenario: A signature replayed from a different flow writes nothing

- GIVEN a signature that was validly produced for a different flow's `state`
- WHEN it is presented on a callback for the current flow's `state`
- THEN no account's `googleSub` changes
- AND the response is the same generic failure outcome as any other callback failure

#### Scenario: An invalid link marker never falls back to the implicit login/link path

- GIVEN any of the tampered, missing, malformed, or replayed conditions above
- WHEN the callback processes the request
- THEN the implicit, email-matched login/link resolution (AUTH-14) is never attempted
- AND no session is issued

### Requirement: VINC041-04 — A Google identity owned by another account is refused, never re-linked (★, CA-02)

If the Google identity being linked already has a `googleSub` on a **different** account, the link
attempt MUST be refused with the same generic outcome as any other rejection — anti-enumeration: the
caller MUST NOT be able to tell "this Google account is already someone else's" apart from any other
failure. The other account's row MUST remain completely untouched.

#### Scenario: Another account's Google identity is refused without disclosure or re-link

- GIVEN user B's account already has `googleSub` set to a given identity
- WHEN user A completes the OIDC round trip using that same Google identity
- THEN the response is the one generic failure outcome shared by every link-mode failure — a single,
  indistinguishable destination whether the cause is another account's identity, an identity already
  present on the caller's own account, a demo user, a lost race, or a missing user
- AND user A's account gains no `googleSub`
- AND user B's account is unchanged

### Requirement: VINC041-05 — Linking while a different identity is already present is refused

If the caller's own account already carries a `googleSub` different from the one being linked, the
attempt MUST be refused — switching Google accounts is unlink-then-link, never a single compound
operation. The account's existing `googleSub` MUST remain unchanged.

#### Scenario: Switching identities in one step is refused

- GIVEN an account whose `googleSub` is already set to identity X
- WHEN the caller completes the OIDC round trip with a different identity Y
- THEN the link attempt is refused with the same generic outcome as VINC041-03's rejections
- AND the account's `googleSub` remains X

### Requirement: VINC041-06 — Unlink never leaves an account without an access method (CA-03)

`POST /api/perfil/google/desvincular` MUST clear `googleSub` if, and only if, the account still has a
password set, and this condition MUST be evaluated and enforced as part of the same write that clears
the column — not as a separate check followed by a separate write, so that no window exists in which
the check has passed but the state has since changed. A caller whose account has no password MUST have
the unlink refused with an actionable, own-account-only error, and `googleSub` MUST remain unchanged.

#### Scenario: A passwordless account's unlink is refused and changes nothing

- GIVEN an account with no password set and a linked `googleSub`
- WHEN the caller, in a session for that account, requests unlink
- THEN the response is `403` with an actionable, own-account error distinct from the generic rejection
- AND the account's `googleSub` is unchanged

#### Scenario: A concurrent password removal cannot leave the account without any access method

- GIVEN the unlink invariant is enforced by a single write whose condition includes "a password is
  still present"
- WHEN the unlink write executes
- THEN it is impossible to observe an intermediate state where the password-presence check passed but
  the write proceeds against an account that no longer has a password — the write and the check share
  one atomic statement, not a read followed by a write

#### Scenario: A password-holding account's unlink clears the link

- GIVEN an account with a password set and a linked `googleSub`
- WHEN the caller unlinks with the correct current password
- THEN the response is `204`
- AND the account's `googleSub` is cleared

### Requirement: VINC041-07 — Wrong current password on link or unlink is indistinguishable from other rejections

A wrong `passwordActual` on either `POST /api/perfil/google/vincular` or
`POST /api/perfil/google/desvincular` MUST produce the exact same generic rejection (status, code, and
message) that `perfil-usuario`'s current-password check produces for the same failure, and MUST NOT set
any cookie or write any field.

#### Scenario: Wrong password blocks link initiation

- GIVEN an authenticated, non-demo session
- WHEN the caller sends `POST /api/perfil/google/vincular` with an incorrect `passwordActual`
- THEN the response is the same generic rejection `perfil-usuario` uses for a wrong current password
- AND no cookie carrying a link intent is set, and no field changes

#### Scenario: Wrong password blocks unlink

- GIVEN an authenticated, non-demo session whose account has a password and a linked `googleSub`
- WHEN the caller sends `POST /api/perfil/google/desvincular` with an incorrect `passwordActual`
- THEN the response is the same generic rejection `perfil-usuario` uses for a wrong current password
- AND `googleSub` is unchanged

### Requirement: VINC041-08 — The identity read exposes whether Google is linked (CA-04)

The authenticated identity read (`GET /api/auth/me`) MUST expose whether the account has a linked
Google identity, derived from the presence of `googleSub`, without ever exposing the raw `googleSub`
value itself across the read.

#### Scenario: Identity read reflects the linked state

- GIVEN an account with `googleSub` set
- WHEN the caller sends `GET /api/auth/me`
- THEN the response indicates the account is linked to Google
- AND the response never contains the raw `googleSub` value

#### Scenario: Identity read reflects the unlinked state

- GIVEN an account with no `googleSub`
- WHEN the caller sends `GET /api/auth/me`
- THEN the response indicates the account is not linked to Google

### Requirement: VINC041-09 — Demo sessions cannot link or unlink

Both `POST /api/perfil/google/vincular` and `POST /api/perfil/google/desvincular` MUST refuse a demo
session with `403` and the same demo-read-only code `perfil-usuario`'s mutations use, and MUST NOT
write anything or set any link-intent cookie.

#### Scenario: Demo session cannot link

- GIVEN a demo session
- WHEN it calls `POST /api/perfil/google/vincular` with an otherwise valid body
- THEN the response is `403` with the demo-read-only code
- AND no cookie carrying a link intent is set and no field changes

#### Scenario: Demo session cannot unlink

- GIVEN a demo session
- WHEN it calls `POST /api/perfil/google/desvincular` with an otherwise valid body
- THEN the response is `403` with the demo-read-only code
- AND no field changes

### Requirement: VINC041-10 — No Google token is ever persisted and every operation is self-scoped (CA-05)

Neither linking nor unlinking MUST ever persist a Google `access_token`, `refresh_token`, or `id_token`
anywhere. Both endpoints MUST operate exclusively on the requesting session's own user — no field in
either request body MUST be capable of targeting a different user's account.

#### Scenario: No Google token is stored by either operation

- GIVEN a completed link and a completed unlink, in either order
- WHEN the database is inspected afterward
- THEN no row contains a Google `access_token`, `refresh_token`, or `id_token`

#### Scenario: No request field can redirect either operation to another user

- GIVEN user A's authenticated session
- WHEN user A sends a link or unlink request with any extra field naming another user's id
- THEN the operation applies only to user A's own account
- AND the named other user's account is unaffected

### Requirement: VINC041-11 — Contract and client types stay in sync, including required-field fallout

The OpenAPI document and the generated `@moneydiary/api-client` types MUST describe both new endpoints
and the `googleVinculado` field on the identity read, and MUST pass the existing CI drift gates.
Because `googleVinculado` is a **required** field on a generated contract type, every consumer that
types a fixture against that contract type MUST still compile — this MUST be verified by running the
type-checking commands (`pnpm web typecheck`, the mobile `tsc --noEmit` command), not merely by running
the test suites, since a suite that does not typecheck cannot catch this.

#### Scenario: Regenerated contract passes drift checks

- GIVEN the endpoints and field implemented per VINC041-01 through VINC041-10
- WHEN `openapi.json` and the api-client types are regenerated
- THEN the CI drift gates for both artifacts report no difference

#### Scenario: Web and mobile stay green after the identity DTO gains a required field

- GIVEN the identity read's generated type now includes the required `googleVinculado` field
- WHEN `pnpm web typecheck` and the mobile project's `tsc --noEmit` command are run
- THEN both succeed with no type errors
- AND this is verified independently of `pnpm web test` passing, which does not perform type-checking

## Non-Goals

- Any `apps/web` or `apps/mobile` UI — no Configuración page, no link/unlink button, no runtime DTO
  guard extension. Owned by US-042 (issue #276).
- Google linking on **mobile** — ADR-035's native `id_token` flow is untouched; it has no OAuth cookie
  and none of this capability's round-trip mechanism.
- Any identity provider other than Google.
- **Registration** with Google (find-or-create) — this capability, like AUTH-14, stays find-only.
- Switching Google accounts in a single compound operation — always unlink then link.
- Requiring the Google email to match the account email at explicit-link time — the explicit path binds
  by session-authenticated, password-re-verified `userId`, not by email; see the `email_verified` scope
  note in `../user-authentication/spec.md`.
- A dedicated `GET /api/perfil` — the link state rides `GET /api/auth/me`, per `perfil-usuario`'s
  existing decision that `/api/auth/me` is the single identity source.
- A database migration — `googleSub String? @unique` and `passwordHash String?` already exist.
- Rate limiting the new password checks beyond the existing `x-api-key` + session gate.
