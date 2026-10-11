# Android app (plan phase 8)

## Objective

Build the native Android app of Mirach in Kotlin and Jetpack Compose, implementing the screen catalog (`docs/catalogo/`) as a thin client of the API, and get it through its first Google Play review.

## Problem

The iPhone app is complete and in App Review. Android does not exist (`apps/android/` is missing). The Play Console account is **personal and created in 2026**, so Google requires a closed test with at least 12 testers opted in for 14 consecutive days before production access can even be requested ([Play Console Help 14151465](https://support.google.com/googleplay/android-developer/answer/14151465)).

## Why

ADR-046 D8: Android second, after the iPhone app. The 14-day clock is the longest pole: a minimal build must reach the closed-testing track as early as possible so the clock runs while the remaining screens are built.

## Context

- Decisions inherited: native apps from scratch (ADR-046 D1), thin clients generated from `openapi.json` (D9), Kotlin Multiplatform rejected. Sign-in: Google (ADR-047) plus the allowlisted reviewer password login (ADR-051). Sign in with Apple is not offered on Android (no native flow; an Apple-only iPhone user cannot sign in on Android in v1 — accepted limitation, to record in the ADR).
- API: `https://mirach-api.onrender.com`, every `/api` call needs `x-api-key` plus Bearer. `POST /api/auth/google/token` verifies the ID token audience against `GOOGLE_CLIENT_ID_ANDROID`/`GOOGLE_CLIENT_ID_IOS`.
- **Gotcha (verified in `crear-auth-google-mobile.ts`):** with Credential Manager the Google ID token's `aud` is the *web*-type client ID passed as `serverClientId`, not the Android-type client. So `GOOGLE_CLIENT_ID_ANDROID` in Render must hold that web client ID, and an Android-type OAuth client (package + SHA-1 of the upload key and of the Play app-signing key) must exist in the same Google Cloud project.
- Toolchain on the machine: JDK 17 (Temurin), Android SDK at `~/Library/Android/sdk` (`sdkmanager` on PATH). No Gradle, no Android Studio.
- The iPhone app (`apps/ios/`, `odd/tasks/app-iphone.md`) is the behavioral reference for every screen: same catalog, same error mappings, same decisions (traffic light hidden, ADR-038 confirmation, etc.).

## Decisions

- **Play account:** personal, created 2026 (user, 2026-10-11) → closed test, 12+ testers, 14 days.
- **applicationId:** `app.mirachbudget.android` (proposed 2026-10-11, mirrors `app.mirachbudget.ios`; immutable after first upload).
- **minSdk 26, targetSdk 36** (Play policy from 2026-08-31), **compileSdk 37** (required by the AndroidX versions in use). Recorded in ADR-052.
- **Location:** `apps/android/`, outside the pnpm workspace, Gradle wrapper committed.

## Constraints

- TDD strict (session configuration). Runner: `./gradlew testDebugUnitTest` (JVM unit tests) plus Compose UI tests where the iOS slice had XCUITest.
- Artifacts in English; user-facing copy in Spanish, identical to the iOS app.
- Only the public `x-api-key` ships in the app, from a git-ignored properties file, never committed.
- Delivery strategy: `ask-on-risk`; one branch/PR per task, stacked when needed.

## Tasks

- [x] **T1 — Tooling, skeleton and ADR-052.** Gradle wrapper, Kotlin + Compose project in `apps/android/`, applicationId, minSdk 26, version catalog, API base URL and key from a git-ignored file with empty-key detection, a screen that reads `/version`, unit test + build green, CI job `android`, README for a first-time Android developer. Route: delegated writer (many new files).
- [ ] **T2 — Generated API client** from `openapi.json`, committed, with a staleness check in CI, wrapped behind an app-owned interface.
- [ ] **T3 — Design tokens to Compose** generated from `design/tokens.json` (light/dark), with a staleness check.
- [ ] **T4 — Session and Resumen:** Google sign-in (Credential Manager) and reviewer password form (only when `passwordLoginEnabled`), session in encrypted storage, `/auth/me` at startup, single 401 relay, Resumen del mes.
- [ ] **T5 — First closed-test release:** release signing (upload key outside the repo), AAB build, Play app creation, internal → closed track, 12+ testers opted in. Owner: Play Console app, OAuth clients, Render `GOOGLE_CLIENT_ID_ANDROID`, testers. **Starts the 14-day clock.**
- [ ] **T6 — Subir cartola** (preview, protected PDF, review and edit, create category from a row).
- [ ] **T7 — Perfil** (name edit, logout, delete account with `ELIMINAR`).
- [ ] **T8 — Detalle de bucket.**
- [ ] **T9 — Ingresos del mes.**
- [ ] **T10 — Cartolas subidas.**
- [ ] **T11 — Categorías y Detalle de categoría.**
- [ ] **T12 — Production readiness and review:** Data safety form, account-deletion web resource (landing), store listing, privacy URL, reviewer credentials in App access, apply for production after day 14, submit.

## Progress

- 2026-10-11: feature document created; branch `feat/android-skeleton`.
- 2026-10-11: **T1 done** (route: delegated writer, many new files). Commits: `e3210f0` feat(android) skeleton, `592f23c` docs(adr) ADR-052 + index + CLAUDE.md, `7c41943` ci `android` job. Versions (all >= 2 weeks old, checked against Maven metadata `Last-Modified`): Gradle 9.7.1 (wrapper, SHA-256 pinned), AGP 9.4.1 (2026-09-18), Kotlin 2.4.20 (2026-09-07), Compose BOM 2026.09.00 (2026-09-09), activity-compose 1.13.0, lifecycle 2.11.0, core-ktx 1.19.0, coroutines 1.11.0, serialization-json 1.10.0, JUnit 4.13.2. targetSdk 36 (Play policy from 2026-08-31, verified), compileSdk 37 (androidx deps require it; platform `android-37.0` installed). TDD: RED = `./gradlew testDebugUnitTest` -> "13 tests completed, 9 failed" (stubs); GREEN = 13/13 pass. Mutation checks: `isBlank`->`isEmpty` failed `blankKeyIsAProblem`; swapping the `SocketTimeoutException` catch failed `reportsTimeoutWithDedicatedMessage`; both restored. `assembleDebug lint` and `assembleRelease` (R8) OK; `actionlint` clean. Not run: emulator/physical device (no UI test in T1), CI job itself (needs a push).

- 2026-10-11 review of T1 (lineage `review-4a9ff2061288c11c`, risk high, 4 lenses, consent granted): approved and acknowledged. Advisories (non-blocking, later work): R3 WARNING `HttpVersionApi` untested (replaced by the generated client in T2: test the new adapter there); R3 blocking I/O not cancellable, cancellation path untested, placeholder key not detected, BuildConfig key unescaped; R2 small readability notes; R1 CI suggestion at `ci.yml:975`. Fixed: the stale SDK decision line (R2).

## Next step

T2 generated API client (replaces `HttpVersionApi` behind `VersionApi`).
