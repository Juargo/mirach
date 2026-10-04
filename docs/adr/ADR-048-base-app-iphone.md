---
tags:
  - adr
  - fase-diseño
  - mobile
  - ios
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-04
fecha_actualizacion: 2026-10-04
---

# ADR-048 — Foundations of the iPhone app

## Estado

✅ **Decidido** (2026-10-04) — plan phase 7. Records the decisions taken before creating the iPhone
project. Choices about the API client, structure and tests are made task by task and recorded in
`odd/tasks/app-iphone.md`; this ADR only holds what is already decided.

## Contexto

Mirach's iPhone app is written from scratch in Swift and SwiftUI (ADR-046, D1 and D8) as a thin
client of the API (D9). The product owner has no previous native-app experience, and a large part of
the work is done from the terminal by an assistant, reviewed in pull requests. ADR-046 left the domain
and the bundle identifier open (D4); the bundle identifier cannot change once the app is published.

## Decisión

1. **Project defined with XcodeGen.** The Xcode project is described in `apps/ios/project.yml` and
   generated with XcodeGen; the generated `.xcodeproj` is not committed. The project configuration
   is readable and reviewable in a pull request, there are no merge conflicts in `project.pbxproj`,
   and the structure can be created or changed from the terminal and in CI without opening Xcode.
2. **Minimum iOS 17.** Enables `@Observable` and `NavigationStack` as the default tools for state
   and navigation, which is what current Apple documentation and courses teach; iOS 17 runs on
   iPhones from 2018 (XS) onwards.
3. **Location: `apps/ios/`**, outside the pnpm workspace (its build is Xcode's, not pnpm's).
4. **Domain `mirachbudget.app` and bundle identifier `app.mirachbudget.ios`** (resolves ADR-046 D4).
   `mirach.app`, `mirach.cl` and similar were taken; names with "finance", "ledger" or "wallet" were
   discarded because they suggest crypto or payments. The App ID is registered with Sign in with
   Apple as primary. The future Android package follows the same root: `app.mirachbudget.android`.
   The app is still called "Mirach" in the stores.

## Consecuencias

- Whoever builds the app needs Xcode and XcodeGen (`brew install xcodegen`); after adding, moving or
  removing a source file, the project is regenerated (`xcodegen generate` in `apps/ios/`), which can
  be automated with a build script or a git hook.
- `apps/ios/*.xcodeproj` is ignored by git; `project.yml` is the source of truth for targets,
  settings, capabilities and build configurations.
- CI can build and test the app on a macOS runner by running XcodeGen first.
- The `.app` top-level domain is HTTPS-only (HSTS preloaded); any web presence on it must serve
  HTTPS, which Vercel and Render provide.
- Moving the domain later is possible but costly where the app embeds the API URL; the bundle
  identifier does not depend on the domain and stays fixed.

## Alternativas consideradas

- **Committing the Xcode project as Xcode leaves it.** Matches tutorials one to one, but
  `project.pbxproj` is practically unreviewable in a pull request and every structural change has to
  be done in Xcode.
- **Tuist.** More powerful (project definition in Swift, caching), but heavier to learn and to
  maintain for a single app.
- **Minimum iOS 16** (older state model to unlearn later) or **iOS 18** (fewer users for little
  gain).
