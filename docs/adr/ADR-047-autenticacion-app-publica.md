---
tags:
  - adr
  - fase-diseño
  - backend
  - seguridad
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-04
fecha_actualizacion: 2026-10-04
---

# ADR-047 — Authentication and account lifecycle for the public apps

## Estado

✅ **Decidido** (2026-10-04) — plan phase 5 ("public-ready API"). Implemented in PRs #25–#28
(demo removal), #30 (Google on iOS), #31/#32 (Sign in with Apple) and #33 (account deletion).
Apple token revocation (T4) is pending and plugs into the deletion hook described below.

## Contexto

Mirach ships native iPhone and Android apps through the App Store and Google Play. The API
inherited an email/password login without registration, a Google login (web redirect flow and an
Android ID-token flow), a demo mode built for an academic delivery, a global `x-api-key` gate and
no account deletion. Store rules and Chilean law shape what a public app must offer:

- App Store guideline 4.8: an app that offers Google Sign-In as its primary login must also offer
  an equivalent login that limits data to name and email and lets the user keep the email private.
  In practice that is Sign in with Apple.
- App Store 5.1.1(v) and Google Play: account deletion must be available inside the app; Google
  Play also asks for a public web resource to request it. Apps using Sign in with Apple must revoke
  the user's Apple tokens on deletion.
- Chile's Ley 21.719 (personal data protection, in force 2026-12-01) includes the right to
  deletion.

## Decisión

1. **Sign-in: Apple and Google only** (user decision, option A). No email/password registration,
   so no password reset flow and no transactional email are built. The existing email/password
   login stays dormant with the other web pieces (ADR-046, D5).
2. **Native ID-token flows.** `POST /api/auth/google/token` accepts Google ID tokens whose audience
   is any configured mobile client ID (`GOOGLE_CLIENT_ID_ANDROID`, `GOOGLE_CLIENT_ID_IOS`).
   `POST /api/auth/apple/token` verifies Apple identity tokens against Apple's JWKS (`iss`, `aud` =
   `APPLE_BUNDLE_ID`, `exp`, signature by `kid`, and the SHA-256 of the app's raw nonce). Each flow
   is off (404 stub) until its variables are set, and `GET /api/auth/capabilities` reports which
   ones are on. Both answer every credential failure with the same 401 body as `/auth/login`.
3. **Identity.** Accounts are keyed by the provider subject (`googleSub`, `appleSub`), never by
   email alone. A provider email links to an existing account only when it is verified and, for
   Apple, not a private relay address, behind an anti-takeover guard (the row must not already
   belong to another subject of the same provider). A new account requires an email: the iOS app
   must request the `email` scope on the first Apple authorization. Concurrent first sign-ins of the
   same identity resolve to one account.
4. **Demo mode is removed**, not dormant (user decision; amends ADR-046 D5): no route, no gates, no
   columns.
5. **Account deletion** (user decision, option A): `DELETE /api/cuenta` requires a valid session and
   the body `{ "confirmacion": "ELIMINAR" }`. One transaction deletes every session, transaction,
   ingestion, classification pattern, category, bank account and the user, each statement scoped by
   the session's `userId`. A revocation hook (`IRevocadorIdentidadExterna`) runs before the delete;
   it is a no-op until T4, and a revocation failure never blocks the deletion.
6. **`x-api-key` is a client gate, not authentication.** It travels inside the native app binaries,
   so it must be treated as public: it filters casual traffic and lets the API be closed quickly by
   rotating it, nothing more. Authorization is always the session (Bearer token for the apps). No
   endpoint may rely on the key to identify a user or a client, and no secret other than this key
   is embedded in the apps.

## Consecuencias

- Production needs, before each login works live: `GOOGLE_CLIENT_ID_IOS` (iOS OAuth client in
  Google Cloud), `GOOGLE_CLIENT_ID_ANDROID` when the Android app exists, and `APPLE_BUNDLE_ID` (Sign
  in with Apple enabled on the App ID).
- Rotating `x-api-key` forces an app update; keep that in mind before rotating in production.
- Schema changes that add columns are applied to production before the code that reads them is
  merged; changes that drop columns are applied after the deploy (Render deploys `main` and does not
  run migrations).
- Pending, tracked in `odd/tasks/api-publica.md`: Apple token revocation (T4, needs the `.p8` key,
  Team ID and Key ID; the hook needs a timeout and an attributable warning); the public web page to
  request deletion for Google Play (landing); native token routes answer infrastructure failures
  with 401 instead of 5xx; malformed JSON answers 500 across the API.

## Alternativas consideradas

- **Email/password registration alongside Apple and Google (option B) or alone (option C).**
  Rejected: both need verification and password recovery through an email provider, for little gain
  over one-tap provider sign-in.
- **Keeping demo mode dormant.** Rejected by the product owner: it existed only for the academic
  delivery and touched about 120 files.
- **Deletion with a recent-session window or a fresh provider token (options B and C).** Rejected
  for now in favour of an explicit confirmation; can be tightened later without changing the
  endpoint.
- **Treating `x-api-key` as a secret.** Not possible: anything shipped in an app binary can be
  extracted.
