# App Store readiness (repo side)

## Objective

Close the repository-side gaps that block submitting the iPhone app to App Review: privacy manifest, export-compliance key, privacy and support pages, and stale documentation.

## Problem

An audit on 2026-10-09 found that `apps/ios` has no `PrivacyInfo.xcprivacy` and no `ITSAppUsesNonExemptEncryption`, the landing privacy page does not cover Apple sign-in, account deletion or a contact address, there is no support page, and several docs still say Apple token revocation is a no-op (it is live in production since #64/#65).

## Why

App Store Connect requires a privacy manifest for apps using required-reason APIs, privacy and support URLs, and an export-compliance answer. Stale docs mislead the review notes and future work.

## Scope

- iOS (`feat/ios-app-store-privacy`): `PrivacyInfo.xcprivacy` declared via `project.yml`, `ITSAppUsesNonExemptEncryption: false`, stale revocation docs, bundle ID in the Apple sign-in runbook.
- Landing (`feat/landing-privacy-support`): privacy page update and a new support page, contact `jorgeretamalaburto@gmail.com`.

Out of scope: app icon (needs an image from the product owner), App Review demo data (product decision), App Store Connect metadata, archive and upload.

## Constraints

- TDD strict (session configuration). iOS runner: `xcodebuild test` (scheme `Mirach`); landing runner: its `package.json` checks.
- Artifacts in English except user-facing Spanish copy, which follows the existing pages.
- Delivery strategy: `ask-on-risk`; two PRs, one per branch.

## Tasks

- [x] **T1 — iOS privacy manifest and export compliance.** Route: delegated writer (2+ non-trivial files). Acceptance: a test proves the built app bundles `PrivacyInfo.xcprivacy` declaring the required-reason APIs actually used (none: `.fileSizeKey` is not on Apple's list, verified 2026-10-09) and the collected data types, and that `ITSAppUsesNonExemptEncryption` is `false`; RED observed first.
- [x] **T2 — Stale docs.** Route: same writer, mechanical. Acceptance: no doc says Apple revocation is a no-op; the runbook uses `app.mirachbudget.ios`.
- [ ] **T3 — Landing privacy and support pages.** Route: delegated writer. Acceptance: privacy page covers Apple sign-in, financial data, deletion and retention, and the contact email; `/soporte` exists and is linked; landing checks green.

## Progress

- 2026-10-09: feature document created; worktree `~/dev/mirach-worktrees/appstore-ios`.
- 2026-10-09: T1 done in c4989f1. RED: 4 PrivacyManifestTests failed (no manifest, no encryption key); GREEN after adding both; full `-only-testing:MirachTests` 551 tests passed. `.fileSizeKey` is not a required-reason API, so `NSPrivacyAccessedAPITypes` is empty (the acceptance wording about a file-size reason was wrong). Collected: name, email, user ID, other financial info.
- 2026-10-09: T2 done: revocation docs (iOS README, catalog README gap 6, perfil.md) and the runbook bundle ID. ADR-047 still describes revocation as pending: left as a historical record, superseded by ADR-049.

## Next step

T3 (landing worktree).
