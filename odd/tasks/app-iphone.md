# iPhone app (plan phase 7)

## Objective

Build the native iPhone app of Mirach in Swift and SwiftUI, implementing the screen catalog (`docs/catalogo/`) as a thin client of the API, starting with a learning slice: sign in with Apple and one read-only screen, running on the product owner's iPhone.

## Context

- Decisions: native apps from scratch, iPhone first (ADR-046 D1, D8); thin clients generated from `openapi.json` (D9); sign-in with Apple and Google only (ADR-047).
- The product owner has no previous native-app experience: every task explains the SwiftUI concepts it introduces, and the first slice exists to learn before committing to structure.
- Apple setup done (2026-10-04): individual Apple Developer account; domain `mirachbudget.app`; App ID `app.mirachbudget.ios` with Sign in with Apple (primary); Sign in with Apple key in `~/.config/mirach/` (Key ID `Z46L4835T5`, Team ID `SUX4J95Z5F`); `APPLE_BUNDLE_ID` set in Render, `appleLoginEnabled: true` in production.
- API: `https://mirach-api.onrender.com` (free tier: ~50 s cold start after idle). Every `/api` call needs `x-api-key` (public client gate, ADR-047) plus the Bearer session.

## Decisions

- **Minimum iOS: 17** (user, 2026-10-04). Enables `@Observable` and `NavigationStack` as the default state and navigation tools.
- **Location:** `apps/ios/`, outside the pnpm workspace.
- **Bundle ID:** `app.mirachbudget.ios`.
- **Project tooling: XcodeGen** (user, 2026-10-04): `apps/ios/project.yml` is the source of truth; the generated `.xcodeproj` is git-ignored. Recorded with the other foundations in ADR-048.

## Proposed defaults (to confirm as tasks start)

- **API client:** Apple's `swift-openapi-generator` (Swift Package plugin) generating types and a client from `apps/api/openapi.json`, wrapped behind small protocols so screens never depend on generated types directly.
- **Structure:** one folder per catalog screen (feature), a thin view model per screen using `@Observable`, shared design tokens generated from `design/tokens.json`.
- **Session:** Bearer token in the Keychain; `SESION_INVALIDA` → back to sign-in.
- **Tests:** Swift Testing for view models and mapping; XCUITest for the learning slice; the old Maestro flows as acceptance scripts later.
- **Secrets:** only the public `x-api-key` ships in the app, via build configuration, never committed in plain source.

## Tasks

- [x] **T1 — Tooling and project skeleton.** Xcode installed (user), project created in `apps/ios/` with the chosen tooling, iOS 17, bundle ID, Sign in with Apple capability, a build that runs on the simulator. Route: delegated writer; commit `cbb3f6e` (code) and the README commit.
- [ ] **T2 — Generated API client** (phase 6 T3): generator wired to `openapi.json`, CI check for stale generation plus `pnpm design:check` (phase 6 T2 review warning).
- [ ] **T3 — Design tokens to Swift:** colors (light/dark), typography rules and labels generated from `design/tokens.json`.
- [ ] **T4 — Learning slice:** sign in with Apple against `POST /api/auth/apple/token`, session in the Keychain, and the read-only "Resumen del mes" screen, on the product owner's iPhone.
- [ ] **T5 onward:** the rest of the v1 catalog, one screen per task, in an order to agree after T4.

## Progress

- ADR-048 written (XcodeGen, iOS 17, `apps/ios/`, `mirachbudget.app`, `app.mirachbudget.ios`).
- T1 done (2026-10-04): XcodeGen skeleton in `apps/ios/`; observed RED (view model missing) then GREEN; `xcodebuild build` succeeded, `xcodebuild test` passed (6 Swift Testing + 1 XCUITest, stubbed client via `-uiTestStubbedClient`); app ran in the iPhone 18 Pro simulator showing live `/version` 0.10.0, commit `87a1aee`.
- T1 review fixes (2026-10-04): `URLError(.cancelled)` now maps to cancellation (RED observed, then GREEN); HTTP error statuses get their own server-unavailable message; `CFBundleShortVersionString`/`CFBundleVersion` map to the build settings (built app reports 0.1.0); generated `Info.plist`/`.entitlements` untracked and git-ignored; retry uses `.task(id:)` instead of an unstructured `Task`; ADR-048 status row updated.

## Next step

T1 PR, then T2 (generated API client) or T4 (learning slice) — to agree.
