# User Authentication Specification

## Purpose

Defines per-user login, stateful session lifecycle, and logout for `apps/api`, `apps/web`, and (revision) `apps/mobile`. Sessions are the source of `userId` consumed elsewhere (see `user-data-isolation`). One session model, two transports: web uses an HttpOnly cookie; mobile uses `Authorization: Bearer` (see `mobile-session-auth` for mobile-specific client behavior). Login-only: register, password reset, email verification, OAuth, sliding sessions, remember-me, MFA, and lockout beyond basic rate-limiting are explicit non-goals of this change, for both clients.

## Requirements

### Requirement: AUTH-01 — Login success creates a session, sets a cookie, and returns the token for Bearer clients

(Previously: response body MUST NOT contain the raw token, at all — web-only. Revised for dual transport: mobile cannot rely on HttpOnly cookies, so the same login response also carries the token for Bearer storage.)

On valid credentials, the system MUST create a `Session` row and set an HttpOnly, SameSite=Strict, host-only cookie carrying the opaque token (`Secure` MUST be set in production, MAY be omitted on `http://localhost`). The response body MUST ALSO include the same raw token, so non-cookie clients (mobile) can persist it and send it as `Authorization: Bearer <token>`. The web client implementation MUST NOT read, store, or forward the body token — it MUST rely exclusively on the HttpOnly cookie for its own requests. Returning the token in the body is a deliberate, scoped XSS-surface tradeoff to enable mobile Bearer auth; it MUST NOT be treated as a general-purpose token-in-body pattern for web.

#### Scenario: Correct email and password (cookie set for every client)

- GIVEN a seeded user with a known email and password
- WHEN a client sends `POST /api/auth/login` with matching credentials and a valid `x-api-key`
- THEN the response status is 200 or 201
- AND the response sets a `Set-Cookie` header for the session cookie (HttpOnly; SameSite=Strict; no `Domain=`)
- AND the response body includes the raw session token

#### Scenario: Mobile client stores the body token for Bearer auth

- GIVEN a seeded user with a known email and password
- WHEN the mobile app sends `POST /api/auth/login` with matching credentials and a valid `x-api-key`
- THEN the mobile app reads the token from the response body and stores it in Expo SecureStore
- AND subsequent mobile requests carry `Authorization: Bearer <token>` instead of the cookie

#### Scenario: Web client never persists the body token

- GIVEN the web app receives a successful login response containing both `Set-Cookie` and a body token
- WHEN the web client code processes the response
- THEN it MUST NOT read, store in JS-accessible storage, or transmit the body token
- AND it relies solely on the HttpOnly cookie for subsequent authenticated requests

### Requirement: AUTH-02 — Login failure never reveals whether the email exists

Unknown email and wrong password for a known email MUST return the same status code and the same generic error body. The comparison path MUST NOT introduce a timing signal a client can trivially use to distinguish the two cases.

#### Scenario: Unknown email

- GIVEN no user exists with `nobody@example.com`
- WHEN a client sends `POST /api/auth/login` with that email and any password
- THEN the response status is 401
- AND the body contains a generic "invalid credentials" message with no indication the email is unknown

#### Scenario: Known email, wrong password

- GIVEN a seeded user with a known email
- WHEN a client sends `POST /api/auth/login` with that email and an incorrect password
- THEN the response status and body are identical in shape to the unknown-email scenario

### Requirement: AUTH-03 — Passwords are stored only as an argon2id hash

The system MUST hash passwords with argon2id before persistence and MUST NOT store, log, or return the plaintext password anywhere.

#### Scenario: Seeded credential is not plaintext

- GIVEN the seeded user row in the database
- WHEN the `passwordHash` column is inspected
- THEN it is an argon2id hash, not the plaintext password
- AND no application log line contains the plaintext password

### Requirement: AUTH-04 — Session tokens are stored only as a hash

The database MUST store only `SHA-256(token)` for each session, never the raw token.

#### Scenario: Session row does not contain the raw token

- GIVEN a session created by a successful login
- WHEN the `Session` row is inspected in the database
- THEN the stored value is a hash, not the raw cookie token

### Requirement: AUTH-05 — Session validation gates protected requests via cookie or Bearer token

(Previously: cookie-only. Revised for dual transport — mobile authenticates via `Authorization: Bearer`.)

`SessionGuard` MUST accept the session token from either the `md_session` cookie or an `Authorization: Bearer <token>` header, applying identical hashing, lookup, expiry, and revocation rules regardless of transport. A request carrying a valid, unexpired, non-revoked token via either transport MUST be authorized and MUST resolve `userId` from that session. A request with a missing, expired, revoked, or tampered (non-matching-hash) token — from either transport — MUST be rejected with 401. When both a cookie and a Bearer header are present on the same request, the cookie MUST take precedence (validated first); the Bearer header MUST be ignored in that case.

#### Scenario: Valid cookie session authorizes the request

- GIVEN a session created by a successful login, not yet expired or revoked
- WHEN a client sends a protected request with that session's cookie
- THEN the request is authorized and the resolved `userId` matches the session's owner

#### Scenario: Valid Bearer session authorizes the request

- GIVEN a session created by a successful login, not yet expired or revoked
- WHEN a client sends a protected request with `Authorization: Bearer <token>` and no session cookie
- THEN the request is authorized and the resolved `userId` matches the session's owner

#### Scenario: Missing token on both transports is rejected

- GIVEN no session cookie and no `Authorization: Bearer` header are sent
- WHEN a client sends a protected request (with a valid `x-api-key`)
- THEN the response status is 401

#### Scenario: Tampered token is rejected regardless of transport

- GIVEN a token value (cookie or Bearer) that does not match any stored session-token hash
- WHEN a client sends a protected request with that token
- THEN the response status is 401

#### Scenario: Cookie takes precedence when both are present

- GIVEN a request carries a valid session cookie AND a different/invalid `Authorization: Bearer` header
- WHEN the request is processed
- THEN `SessionGuard` validates using the cookie's token and authorizes the request
- AND the Bearer header is not consulted

### Requirement: AUTH-06 — Sessions expire after an absolute 7-day TTL

Each session MUST carry an `expiresAt` set to creation time + 7 days (absolute, no sliding renewal). A session past `expiresAt` MUST be treated as absent.

#### Scenario: Expired session is rejected

- GIVEN a session whose `expiresAt` is in the past
- WHEN a client sends a protected request with that session's cookie
- THEN the response status is 401
- AND the resolved identity is treated as if no session existed

### Requirement: AUTH-07 — Logout revokes only the current session

`POST /api/auth/logout` MUST revoke the session row identified by the request's cookie and MUST clear that cookie. Other active sessions belonging to the same user MUST remain valid (multi-session is allowed).

#### Scenario: Logout revokes the current session only

- GIVEN a user with two active sessions (session X and session Y) from two different logins
- WHEN the client holding session X calls `POST /api/auth/logout`
- THEN session X is revoked and its cookie is cleared
- AND session Y still authorizes protected requests

### Requirement: AUTH-08 — Login attempts are rate-limited

*(Pending design: exact thresholds, window, and storage mechanism are a design-phase decision — see proposal open questions.)* The system MUST throttle repeated failed login attempts per IP and per email within a configurable window, returning a distinct response once the threshold is exceeded. Successful authentication MUST NOT be throttled by this mechanism.

#### Scenario: Excessive failed attempts are throttled

- GIVEN a configured failure threshold for a given email or IP has been exceeded within the configured window
- WHEN another login attempt is made for that email or IP
- THEN the response is a throttling response distinct from the generic invalid-credentials response (e.g. 429)

#### Scenario: Legitimate login is unaffected

- GIVEN no threshold has been exceeded
- WHEN a client logs in with correct credentials
- THEN the login succeeds as in AUTH-01

### Requirement: AUTH-09 — `GET /api/auth/me` reports the authenticated identity

With a valid session, `GET /api/auth/me` MUST return the authenticated user's minimal identity —
including `nombre` and `googleVinculado` — but no password hash, no session token, and no raw
`googleSub`. Without a valid session, it MUST return 401.

(Previously: the identity payload did not include `googleVinculado`. See `vinculacion-google`
VINC041-08 for the full requirement on what this field means and how it is derived.)

#### Scenario: Authenticated request returns identity including nombre

- GIVEN a valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 200
- AND the body contains the user's id/email/nombre but no credential or token material

#### Scenario: Unauthenticated request is rejected

- GIVEN no valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 401

#### Scenario: nombre reflects the most recent profile update

- GIVEN a user who changed their `nombre` via `PATCH /api/perfil` (see `perfil-usuario`)
- WHEN they subsequently send `GET /api/auth/me`
- THEN the returned `nombre` is the updated value

#### Scenario: Identity payload includes the Google link state

- GIVEN a valid session
- WHEN a client sends `GET /api/auth/me`
- THEN the response body includes `googleVinculado`, reflecting whether the account currently has a
  linked Google identity, and never includes the raw `googleSub` value

### Requirement: AUTH-10 — Web redirects unauthenticated visits to `/login`

The web app MUST redirect an unauthenticated visit to any protected route to `/login`, and MUST allow the user to reach the app after a successful login. The landing page's "Ingresar" button behavior is unchanged.

#### Scenario: Unauthenticated visit redirects

- GIVEN no valid session in the browser
- WHEN the user navigates to a protected route (e.g. the resumen screen)
- THEN the browser is redirected to `/login`

#### Scenario: Successful login reaches the app

- GIVEN the user is on `/login`
- WHEN they submit valid credentials
- THEN they are able to reach the previously protected route

### Requirement: AUTH-11 — Google login initiation requires top-level navigation

`GET /api/auth/google` MUST enforce the same Sec-Fetch top-level-navigation guard used by `GET /api/auth/demo` (`esNavegacionDeNivelSuperior`), reused verbatim. A request that fails the guard MUST be rejected with 403 and MUST NOT redirect to Google. The endpoint MUST apply per-IP rate limiting on initiation, mirroring the existing login/demo rate limiters. On success, the system MUST generate `state`, a PKCE `code_verifier`/`code_challenge` (S256), and a `nonce`; persist them in a short-lived transient cookie; and respond with a 302 to Google's authorization endpoint.

#### Scenario: Top-level navigation redirects to Google

- GIVEN Google login is active (AUTH-16)
- WHEN a browser performs a top-level navigation to `GET /api/auth/google`
- THEN the response is a 302 redirect to Google's authorization endpoint
- AND a transient cookie carrying `state`/PKCE/`nonce` is set

#### Scenario: Non-top-level request is rejected

- GIVEN Google login is active
- WHEN a request to `GET /api/auth/google` is made in a context that is not a top-level navigation (e.g. embedded as an `<img>`/`<iframe>` sub-resource)
- THEN the response status is 403
- AND no redirect to Google occurs and no transient cookie is set

#### Scenario: Excessive initiate attempts are throttled

- GIVEN a configured per-IP threshold for `GET /api/auth/google` has been exceeded within the configured window
- WHEN another top-level navigation to `GET /api/auth/google` is made from that IP
- THEN the response is a throttling response distinct from the normal redirect (e.g. 429)

### Requirement: AUTH-12 — Google callback validates state, PKCE, and id_token before resolving identity, and is dual-mode

`GET /api/auth/google/callback` MUST validate the returned `state` against the transient cookie
(single-use — the transient cookie MUST be invalidated once read, regardless of outcome), MUST
validate the PKCE `code_verifier`, and MUST cryptographically validate the `id_token` (signature,
`iss`, `aud`, `exp`, `nonce`) before any identity resolution is attempted. Any validation failure at
this stage MUST redirect to `/login?error=...` using the same generic message defined by AUTH-15 — no
failure copy or status code may distinguish "bad state" from "bad token" from "no matching account."

The same callback route is dual-mode: when the OAuth cookie carries a validly signed link marker (see
`vinculacion-google` VINC041-03), the request MUST be routed to the explicit link resolution instead of
the implicit login/link resolution defined by AUTH-14, and in that mode the callback MUST NOT issue a
new session — the caller's existing `md_session` was only ever withheld on the cross-site hop, not
revoked. When no link marker is present, the callback's behavior is unchanged from before this
requirement was modified: it always resolves through the implicit login/link path (AUTH-14) and always
issues a session on success (AUTH-13).

(Previously: the callback had exactly one mode — implicit login/link resolution followed by session
issuance on every success path. See `vinculacion-google` VINC041-03 for how the link marker's integrity
is established.)

#### Scenario: Valid state, PKCE, and id_token proceed to identity resolution

- GIVEN a transient cookie set by a prior call to `GET /api/auth/google`
- WHEN `GET /api/auth/google/callback` is called with the matching `state` and a `code` that yields a
  validly-signed `id_token` for the registered `aud`
- THEN the request proceeds to identity resolution (AUTH-14)

#### Scenario: Missing or mismatched state is rejected before identity resolution

- GIVEN no transient cookie, or a transient cookie whose `state` does not match the callback's `state`
  query parameter
- WHEN `GET /api/auth/google/callback` is called
- THEN the request is rejected without calling the token endpoint and without creating a session
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

#### Scenario: Tampered or expired id_token is rejected

- GIVEN a `state`/PKCE pair that validates correctly
- WHEN the resulting `id_token` fails signature, `iss`, `aud`, `exp`, or `nonce` validation
- THEN no session is created
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

#### Scenario: A validly signed link marker routes to explicit link resolution without issuing a session

- GIVEN a caller previously initiated linking (`vinculacion-google` VINC041-01) and the OAuth cookie
  carries a validly signed link marker for the current `state`
- WHEN `GET /api/auth/google/callback` completes an otherwise-valid OIDC exchange
- THEN the request resolves through the explicit link path, not the implicit login/link path
- AND no new `Session` row is created and no `md_session` cookie is set by the callback

#### Scenario: Absence of a link marker preserves the existing login-only behavior

- GIVEN the OAuth cookie carries no link marker
- WHEN `GET /api/auth/google/callback` completes an otherwise-valid OIDC exchange
- THEN the request resolves through the implicit login/link path (AUTH-14) exactly as before this
  requirement was modified
- AND a session is issued on success (AUTH-13)

### Requirement: AUTH-13 — Google login issues the same session as password login

On successful identity resolution (AUTH-14), the system MUST issue a session through the identical session-creation path used by password login (AUTH-01): an opaque token, its SHA-256 hash persisted in the `Session` row, and the 7-day absolute TTL defined by AUTH-06. On the web transport, the callback MUST set the `md_session` cookie with attributes equivalent to the password-login cookie (HttpOnly, host-only, `Secure` in production) and MUST redirect (302) into the app. A session created via Google login MUST be indistinguishable, in the `Session` table and under `SessionGuard` (AUTH-05), from one created via password login.

#### Scenario: Successful Google login sets an equivalent session cookie

- GIVEN a Google identity that resolves to an existing user (AUTH-14)
- WHEN `GET /api/auth/google/callback` completes successfully
- THEN a `Session` row is created with a SHA-256 token hash and `expiresAt` at creation time + 7 days
- AND the response sets `md_session` with the same HttpOnly/host-only/`Secure` attributes as a password-login session
- AND the response is a 302 redirect into the app

#### Scenario: A Google-issued session validates identically to a password-issued session

- GIVEN a session created via Google login, not yet expired or revoked
- WHEN a client sends a protected request carrying that session's cookie
- THEN `SessionGuard` authorizes the request and resolves `userId` from that session, per AUTH-05, with no code path distinguishing how the session was created

### Requirement: AUTH-14 — Google identity resolution is find-only; no user is ever created

The system MUST resolve a validated Google identity (`sub`, `email`, `email_verified`) to an existing
MoneyDiary user using the following order, and MUST NOT create a user at any point in this flow. This
resolution order, and its `email_verified` gate, apply only to the **login** path — when the callback's
OAuth cookie carries no link marker (AUTH-12). The explicit link path (`vinculacion-google` VINC041-02)
binds by session-authenticated, password-re-verified `userId` instead, and never consults
`email_verified`; see `vinculacion-google`'s Non-Goals for why an email match is not required there.

1. Look up a user by `googleSub === sub`. If found (and not a demo user), that user is the match.
2. Else, if `email_verified === true`, derive the blind index for `email` using the same pipeline
   password login and ADR-013 already use, and look up a user by `emailBlindIndex`. A Google email MUST
   NOT be compared in cleartext against the database at any point. If a match is found and it is not a
   demo user:
   - If that user's `googleSub` is already set to a value different from the incoming `sub`, the system
     MUST NOT overwrite it and MUST fail with the generic error defined by AUTH-15 (this is not the
     same case as step 1 — step 1 already failed to match, so a non-null `googleSub` found here belongs
     to a different, already-linked Google identity).
   - Otherwise (the user's `googleSub` is unset), the system MUST persist `googleSub` on that user
     (link) before issuing the session.
3. Else, if `email_verified` is not `true`, the system MUST NOT attempt an email-based lookup at all.
4. If no match is found by step 1 or step 2, the system MUST NOT create a user and MUST fail with the
   generic error defined by AUTH-15.

Users with `esDemo === true` MUST be excluded from both lookup and linking: a Google identity that
would otherwise match a demo user's `googleSub` or linked email MUST be treated as no-match.

(Previously: this resolution order was the callback's only behavior, with no scope qualifier, because
no other resolution path existed. See `vinculacion-google` VINC041-02 through VINC041-05 for the
explicit path's own resolution order.)

#### Scenario: Existing `googleSub` match logs in directly

- GIVEN a non-demo user with `googleSub` already set from a prior login
- WHEN that same Google identity (`sub`) completes the callback with no link marker present
- THEN the user is resolved by `googleSub` alone (no email lookup is performed)
- AND a session is issued for that user (AUTH-13)

#### Scenario: First-time login links by verified email

- GIVEN a non-demo user with `googleSub` unset and a known email
- WHEN a Google identity with `email_verified: true` and a matching email (via blind index) completes
  the callback with no link marker present
- THEN the system persists `googleSub` on that user
- AND a session is issued for that user (AUTH-13)

#### Scenario: Unverified email never triggers a lookup

- GIVEN a Google identity with `email_verified: false` and an email that matches an existing user
- WHEN that identity completes the callback with no link marker present
- THEN the system does not perform an email-based lookup
- AND the request fails with the generic error (AUTH-15) — no `googleSub` is persisted and no session
  is issued

#### Scenario: No match anywhere creates nothing

- GIVEN a Google identity whose `sub` matches no user and whose email (when `email_verified: true`)
  matches no user
- WHEN that identity completes the callback with no link marker present
- THEN no user row is created
- AND the request fails with the generic error (AUTH-15), indistinguishable in response shape from
  AUTH-02's unknown-email case

#### Scenario: Demo users are excluded from linking

- GIVEN a demo user (`esDemo === true`) whose email would otherwise match a Google identity with
  `email_verified: true`
- WHEN that identity completes the callback with no link marker present
- THEN the system treats it as no-match — the demo user is not looked up, linked, or authenticated
- AND the request fails with the generic error (AUTH-15)

#### Scenario: Email match already linked to a different Google identity is rejected, not re-linked

- GIVEN a non-demo user whose `googleSub` is already set, from a prior login, to a value belonging to a
  different Google identity
- WHEN a different Google identity (a different `sub`) with `email_verified: true` and a matching email
  (via blind index) completes the callback with no link marker present
- THEN the system does not overwrite the existing `googleSub`
- AND the request fails with the generic error (AUTH-15) — no re-link occurs and no session is issued

#### Scenario: Login-path resolution is unreachable when a link marker is present

- GIVEN the OAuth cookie carries a validly signed link marker
- WHEN the callback completes
- THEN this login-path resolution order is not executed at all — the explicit link path
  (`vinculacion-google` VINC041-02) runs instead

### Requirement: AUTH-15 — Google login failure never reveals the cause (anti-enumeration parity with AUTH-02)

Every failure path in the Google login flow — invalid or missing `state`, invalid PKCE, invalid `id_token`, unverified email, no matching user, a demo-user match, an email match already linked to a different Google identity, losing the linking race on a concurrent first-time link, or a user-cancelled/denied consent screen — MUST produce the same externally observable outcome: a redirect to `/login?error=...` carrying the identical generic message, with no query-parameter value, HTTP status, or timing signature that lets a client distinguish which of these causes occurred. This message MUST NOT reveal whether a given email is registered, consistent with AUTH-02.

#### Scenario: Different failure causes are indistinguishable

- GIVEN three separate Google login attempts that fail for different reasons — (a) invalid `state`, (b) unverified email matching a real account, (c) no account exists for the identity
- WHEN each attempt reaches its respective failure point
- THEN all three responses redirect to `/login` with the same `error` value and the same rendered message
- AND no response timing or status code differs in a way that discloses which case occurred

### Requirement: AUTH-16 — Google login is active only when both Google credentials are configured

`GET /api/auth/google` and `GET /api/auth/google/callback` MUST exist and be reachable only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. When one or both are absent, both endpoints MUST return 404 (not registered) rather than 500 or a feature-disabled error body. Web and mobile clients MUST NOT render their "Continue with Google" entry point when the feature is not active.

#### Scenario: Missing credentials disable both endpoints

- GIVEN neither `GOOGLE_CLIENT_ID` nor `GOOGLE_CLIENT_SECRET` is configured
- WHEN a client requests `GET /api/auth/google` or `GET /api/auth/google/callback`
- THEN the response status is 404 for both

#### Scenario: Configured credentials enable both endpoints

- GIVEN both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- WHEN a client requests `GET /api/auth/google` as a top-level navigation
- THEN the endpoint behaves per AUTH-11 (redirect to Google), not 404

#### Scenario: Web hides the entry point when inactive

- GIVEN Google login is not active (missing credentials)
- WHEN a user loads `/login`
- THEN no "Continue with Google" entry point is rendered

### Requirement: AUTH-17 — Web presents Google sign-in as a top-level navigation link

The web login screen MUST render the "Continue with Google" entry point as a top-level `<a href="/api/auth/google">` element — never as a click handler that issues a `fetch`/`XMLHttpRequest` or programmatic `window.location` assignment. This preserves the true-browser-navigation requirement AUTH-11 depends on (Sec-Fetch header relay through the same-origin proxy). The web login screen MUST render the `?error=` query parameter, when present, using the same generic alert presentation already used for password-login failures (AUTH-02), without exposing which stage of the Google flow failed.

#### Scenario: Entry point is a real anchor, not a handler

- GIVEN Google login is active
- WHEN `/login` renders
- THEN the "Continue with Google" element is an anchor tag whose `href` is `/api/auth/google`
- AND activating it performs a normal browser navigation, not a script-issued request

#### Scenario: `?error=` renders the generic failure alert

- GIVEN the Google callback redirected to `/login?error=...` after any failure (AUTH-15)
- WHEN `/login` renders
- THEN the same generic alert component/style used for password-login failures is shown

### Requirement: AUTH-18 — Google tokens and flow secrets are never persisted or logged

The system MUST NOT persist Google's `access_token` or `refresh_token` anywhere (database, logs, cache) — no API call to Google beyond OIDC identity verification is made. The `id_token` MUST be validated and then discarded; only the resolved `sub`, the derived email blind index, and the `email_verified` boolean flow past identity resolution. None of the raw `id_token`, authorization `code`, `state`, `code_verifier`, plaintext email, or `googleSub` value MUST appear in application log output for the Google flow. Log entries MUST be limited to request path and outcome (success/failure), matching the logging discipline already applied to the password and demo login handlers (ADR-033).

#### Scenario: Google flow logs contain no token or secret material

- GIVEN a Google login attempt, successful or failed
- WHEN the resulting log lines are inspected
- THEN they contain only the request path and a success/failure outcome
- AND none contain the `id_token`, authorization `code`, `state`, `code_verifier`, plaintext email, or `googleSub` value

#### Scenario: No Google access or refresh token is ever stored

- GIVEN a completed Google login (successful or failed)
- WHEN the database is inspected
- THEN no row contains a Google `access_token` or `refresh_token`
