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
- [x] **T2 — Generated API client** from `openapi.json`, committed, with a staleness check in CI, wrapped behind an app-owned interface.
- [x] **T3 — Design tokens to Compose** generated from `design/tokens.json` (light/dark), with a staleness check.
- [x] **T4a — Session:** Google sign-in (Credential Manager), reviewer password form (only when `passwordLoginEnabled`), session in Keystore-encrypted storage, `/auth/me` at startup, single 401 relay, signed-in placeholder with local «Cerrar sesión».
- [ ] **T4b — Resumen del mes.**
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

- 2026-10-11: **T2 done** (route: delegated writer, 2+ non-trivial files). Generator: OpenAPI Generator 7.25.0 (jar pinned by version + SHA-256, published 2026-08-24), `kotlin` / `jvm-retrofit2` + kotlinx.serialization + coroutines; Retrofit 3.0.0, OkHttp 5.5.0 (2026-08-16), MockWebServer3 5.5.0. Chosen over `jvm-okhttp4` because its calls are blocking (not cancellable) and Retrofit `suspend` cancels the HTTP call. 88 generated files, deterministic (two runs, `git status --porcelain apps/android` empty). `MirachApi` (only `version()`) + `GeneratedMirachApi` adapter + `ApiAuthInterceptor` (`x-api-key` and Bearer only on `/api`) + `AuthTokenProvider`; `VersionApi`/`HttpVersionApi`/`ApiHeaders` removed; 90 s timeout kept. TDD: RED = `./gradlew testDebugUnitTest` -> "22 tests completed, 12 failed" (stubs: 4 interceptor + 8 adapter); GREEN = 22/22. Mutation check: wrapping `api.versionGet()` in `catch (e: Exception) { throw ApiException(0) }` -> "22 tests completed, 6 failed" (cancellation, timeout, IO, serialization tests); restored. `testDebugUnitTest assembleDebug lint assembleRelease` OK, `actionlint` clean; CI `android` job gets a stale-client step and the `apps/api/openapi.json` path filter. Closes the T1 advisories «HttpVersionApi untested» and «blocking I/O not cancellable». Gaps found (nothing dropped: nullable fields `estadoGlobal`/`estadoSemaforo`/`porcentajeBp` and multipart `@Part` for `/api/ingestas*` are present): (1) validator rejects `contentEncoding` on the multipart `file` parts, so the script uses `--skip-validate-spec`; (2) the spec has no `operationId`, methods are named by path; (3) `DELETE /api/cuenta` is generated as `@DELETE` + `@Body`, which Retrofit rejects at call time (verified): T7 must declare it by hand with `@HTTP(hasBody = true)`. Optional API-side prerequisites: drop `contentEncoding`, add `operationId`s. Not run: the CI job itself (needs a push), R8 release on a device. Commits: `7ab7645` generated client + script, `603cdc4` MirachApi/adapter/interceptor/tests/README, `472a045` ci, `6ab5297` docs (ADR-052 + README).

- 2026-10-11 review of T2: the full candidate (88 generated files, 6096 lines) exceeded the reviewer context budget (`lens_context_budget_exceeded`, no authority created). Reviewed instead the hand-written range `7ab7645..653b8cf` (18 files, 440 lines; lineage `review-64dfeb87b1cad190`, risk high, consent granted): approved and acknowledged. `generate-api.sh` (inside `7ab7645`) was read by the parent: pinned SHA-256, temp download verified, trap cleanup, fail on unknown generator warnings. Generated code is covered by the CI determinism check. Advisories (later work): R3 WARNING base URL without trailing slash — verified harmless (generated `ApiClient` normalizes in `init`, `ApiClient.kt:58`); add a factory test with a slash-less URL in T4. Suggestions: stale CI filter comment (`ci.yml:87`), cache the generator jar in CI, interceptor test gaps.

- 2026-10-11: **T3 done** (route: delegated writer, 2+ non-trivial files). `scripts/generate-android-tokens.mjs` + wrapper `apps/android/scripts/generate-tokens.sh` write `core/design/GeneratedTokens.kt` (palettes light/dark grouped like iOS `Color.Mirach.<Group>`, `MirachCopy`, `MirachFont`, `TextStyle.mirachFigures()` with `tnum`, `MirachRadius`); token parsing (`camel`, `pascal`, `collectColors`) extracted to `scripts/design-tokens.mjs` and re-exported by the iOS generator (iOS output unchanged: `git diff --exit-code apps/ios` clean, 8 iOS tests green). `MirachTheme` (system light/dark, Material 3 scheme derived from tokens, square shapes, full palette via `MirachTheme.colors`) applied in `MainActivity`; `/version` and configuration-error screens use tokens. TDD: RED node = `generate-android-tokens.test.mjs` failed (module missing); RED Kotlin = `testDebugUnitTest` compile error "Unresolved reference 'toMaterialColorScheme'"; GREEN = node 16/16 (android 8 + ios 8), JVM 24/24. `design:check` OK, `actionlint` clean, `assembleDebug lint` OK, generator run twice leaves `git status --porcelain apps/android` empty. CI `android` job: token staleness step, `node --test`, setup-node, paths filter extended (also `scripts/design-tokens.mjs` in the iOS filter). Commits: `c223c43` generator + wrapper + shared parsing, `6f5bd18` generated output ONLY (`GeneratedTokens.kt`), `ae037e1` theme, screens, tests, CI, README. Not run: emulator/visual check, CI job itself (needs a push).

- 2026-10-11 review of T3 (range `feat/android-api-client..f449c6e`, 14 files, 723 lines, lineage `review-bd27786367dac640`, risk high, consent granted): approved and acknowledged, no warnings. Suggestions (later work): duplicated color-scheme arguments and unexplained `onError` mapping in `MirachTheme.kt`, Kotlin string escaping and radius NaN guard in the generator, a light-palette test and a theme composable test.

- 2026-10-11: **T4a done** (route: delegated writer, 2+ non-trivial files; branch `feat/android-session`). `MirachApi` + `capabilities()` (Google flag = `googleLoginMobileEnabled`), `signInWithGoogle`, `signInWithPassword`, `currentUser`; typed errors (`SessionExpired`, `ApiKeyRejected`, `InvalidCredentials`, `SignInUnavailable`, `RateLimited`, `ApiException`); one relay (`SessionExpiryRelay`) fed only by 401 `SESION_INVALIDA` on `/me`. Session: AES-256-GCM with an Android Keystore key over SharedPreferences, no new dependency (`security-crypto` deprecated; DataStore adds async for one string the interceptor reads synchronously), recorded in ADR-052. `SessionController` (Validating/SignedOut/SignedIn/ConnectionFailed/Misconfigured), `SignInViewModel`, `GoogleSignInLauncher` interface over Credential Manager (`GetSignInWithGoogleOption`, `serverClientId` = `GOOGLE_WEB_CLIENT_ID`, blank hides the button), `RootRoute`, `MirachApplication` holds the graph. Libraries: androidx.credentials + credentials-play-services-auth 1.6.0 (2026-04-08), googleid 1.2.1 (2026-09-16). T2 advisory closed (slash-less base URL test). TDD: RED = `testDebugUnitTest` compile failure (261 unresolved references: new API, session and sign-in types absent); GREEN = 90/90 (after fixing two bugs in my own tests). Mutation checks: removing the token guard in `SessionController.sessionExpired` failed `aLateExpiryForAnOlderTokenDoesNotEndTheNewSession`; firing the relay on `API_KEY_INVALIDA` failed `aRejectedKeyIsNotASessionExpiry`; both restored. `testDebugUnitTest assembleDebug lint` OK, `actionlint` clean (CI dummy secrets now include `GOOGLE_WEB_CLIENT_ID`). Commits: `f3cd4f6` api + session core, `a5948d8` sign-in UI + root + CI + README, `e399eea` ADR. Not run: emulator/device (Credential Manager, Keystore and the screens are untested at runtime), the CI job. Owner prerequisites for Google end to end: Web OAuth client ID in `secrets.properties`, Render `GOOGLE_CLIENT_ID_ANDROID` = that Web client ID, Android OAuth client (package + SHA-1).

## Next step

T4b Resumen del mes.
- 2026-10-11: **T4a review follow-up** (direct, single writer). R3/R4: `SessionController.start()` is idempotent (acts only while the phase is `Validating`, so a start cancelled mid-flight still re-runs) and the new `retry()` is the only re-validation, only from `ConnectionFailed`; `RootRoute` calls `start()` once and `retry()` on the button, so rotation never re-validates. R1: reviewer password now `remember` (not saveable); it lives only in composable state, never in a ViewModel, so it disappears when sign-in replaces the screen (no JVM-testable place to clear it). R2: `onSessionEnded` doc reworded as the T6 extension point; misleading test renamed. RED: compile failure on `retry`, then with a stub 3 failures (`startingAgainAfterSignInDoesNotValidateAgain`, `startingAgainWhileConnectionFailedDoesNotRevalidate`, `retryOutsideConnectionFailedDoesNothing`); GREEN 94/94. Mutation: removing the guard failed the two `startingAgain...` tests; restored. `testDebugUnitTest assembleDebug lint` OK. Commit `24d7f4a`.
