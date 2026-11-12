# Anonymous account (App Store guideline 5.1.1(v)), delivery 1

Objective: the iOS app works without registration. The API creates an anonymous user on first launch; the person can later link it to Apple or Google. Branch: `feat/cuenta-anonima`. Delivery: `ask-on-risk`; the forecast is above 400 changed lines, so the PR slicing (API, iOS, docs) is asked before any PR is opened. Runners: API `pnpm api test`, `pnpm api lint`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check`; iOS `xcodebuild test -only-testing:MirachTests`.

## Specs

- **S1** Apple's rejection (2026-11-11, submission 18321633-7d27-493c-9d4a-53b82e6ba1f2, build 0.1.0 (9)), quoted: "The app requires users to register or log in to access features that are not account based. Specifically, the app requires users to register before accessing logging features." and "Revise the app to let users freely access the app's features that are not account based. The app may still require registration for other features that are account based."
- **S2** The solution the user asked to study, quoted: "Al abrir la app por primera vez, tu backend crea un usuario anónimo, solo con un UUID y un token guardado en el Keychain, sin correo ni Apple ID. Todo funciona igual, incluidas las cartolas, porque el servidor sigue teniendo un userId al cual asociarlas."
  - API: `POST /api/auth/anonimo` creates a `User` with no `appleSub`, `googleSub`, email or password, with the template catalog and the accepted terms in the same transaction, and answers `{ token, userId, expiresAt }` like the other sign-in routes. The terms rule (AUTH-03, `CONSENTS_REQUIRED`) is the same as in the Apple and Google sign-up.
  - An anonymous user is derived, not stored: no `appleSub`, no `googleSub` and no `passwordHash`. No schema migration.
- **S3** Quoted: "Cuando la persona quiera respaldo o usar otro dispositivo, le ofreces “Vincular con Apple o Google” y conviertes ese usuario anónimo en una cuenta normal, sin migrar datos."
  - API: `POST /api/cuenta/vincular/apple` and `POST /api/cuenta/vincular/google`, behind the session. The body is the one of the matching token route, without the terms versions.
  - The Apple or Google identity is new: the anonymous user gets the `sub` (and the email, when the token brings a verified one), the current session is revoked and a new ordinary session is returned as `{ token, userId, expiresAt }`.
  - The identity already has an account (by `sub`, or by a verified non-relay email, the same rule as sign-in): `409` with code `CUENTA_YA_EXISTE`. Nothing is written; the anonymous data stays as it is. Decided by the user on 2026-11-12: "dos entregas" (the merge is delivery 2).
  - The caller is not anonymous: `409` with code `CUENTA_NO_ANONIMA`.
- **S4** Quoted: "Cuida dos cosas: un límite de uso por dispositivo para que nadie abuse del endpoint, y avisar que si borra la app sin vincular la cuenta, pierde los datos."
  - The limit is per IP (the `x-api-key` is public, so a per-device limit cannot be enforced without App Attest): 10 anonymous sign-ups per IP per hour, never reset by a success. The link routes reuse the per-IP budget pattern of the token routes.
  - iOS warns about the data loss before the anonymous account is created and next to the link action.
- **S5** Session of an anonymous user (assumption stated to the user on 2026-11-12: "la sesión anónima se renueva sola mientras se use la app, y las cuentas anónimas sin actividad se purgan a los 12 meses"): the session lasts 365 days and each use extends it, at most once a day. Sessions of ordinary users keep the fixed 7 days. The purge job itself is not part of this delivery.
- **S6** Existing responses do not change shape (issue #238: the iOS generated client rejects unknown fields). `GET /api/auth/me` answers `200` for an anonymous user with `email: ""`; today it answers `401` because the email is null.
- **S7** iOS: without a session the app shows the terms and a primary action that creates the anonymous account and enters the app; "Ya tengo cuenta" opens the existing sign-in. Perfil shows "Vincular con Apple" and "Vincular con Google" only for an anonymous account, and does not offer "Cerrar sesión" for it (signing out would lose the data). On `CUENTA_YA_EXISTE` the app offers to enter that account and keeps the anonymous session in a separate Keychain item, so delivery 2 can recover its data.
- **S8** A new ADR records the decision and amends ADR-006. Android is out of this delivery (decided 2026-11-12).

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 ADR-013 and index | S8 | inline | pending | |
| T2 API anonymous sign-up | S2, S4, S6 | inline | pending | |
| T3 API sliding anonymous session | S5 | inline | pending | |
| T4 API link Apple and Google | S3, S4 | inline | pending | |
| T5 iOS anonymous entry and link | S4, S7 | inline | pending | |

Route evidence: the iOS unit depends on the API contract (generated client), so the units are not independent and no Writer trigger holds.

## Log

- **L1** (2026-11-12) The user's request, verbatim: "Me respondieron de apple lo sgte [rejection text, S1] Quiero estudiar la siguiente solucion [Opción 1: cuenta anónima automática, S2-S4]". Then, to "¿preferís cambiar a la cuenta existente descartando lo anónimo (con aviso), o fusionar los datos?": "fusionar". To "¿Vamos con las dos entregas o preferís todo junto?": "dos entregas". To "¿Arranco con la implementación de la primera entrega (ADR, API e iOS) en una rama nueva?": "si, arranca".
- **L2** Evidence from exploration: `User.email`, `appleSub`, `googleSub`, `passwordHash` are already nullable (`apps/api/prisma/schema.prisma`). Sessions last a fixed 7 days (`duracion-sesion.ts`); the sliding session of ADR-006 §6 is not built. `PrismaUserCredentialRepository.aIdentidadUsuario` returns null when the email is null, so `/auth/me` answers 401. Issue #238 is open.
