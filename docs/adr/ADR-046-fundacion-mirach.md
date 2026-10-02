---
tags:
  - adr
  - fase-diseño
  - arquitectura
  - mobile
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-02
fecha_actualizacion: 2026-10-02
---

# ADR-046 — Founding decisions of Mirach

## Estado

✅ **Decidido** (2026-10-02) — Mirach is the definitive product built on top of the MoneyDiary
API and landing. This ADR records the nine decisions taken when the repository was split from
`Juargo/MoneyDiary`.

## Contexto

MoneyDiary was built as an academic project: an Express API, a React web app, an Expo mobile app
and an Astro landing in one pnpm monorepo. The product continues under a new name and a new
repository whose focus is native mobile apps for iPhone and Android. Only the API and the landing
carry over as code; the web and Expo apps remain in the old repository as product references.

## Decisión

1. **Native apps written from scratch (D1).** Swift/SwiftUI for iPhone and Kotlin/Jetpack Compose
   for Android. The screens of the old `apps/web` and `apps/mobile` are reference material only;
   no code from them moves.
2. **Separate infrastructure (D2).** New Supabase project, Render service, Vercel project, domain,
   `API_KEY` and `ENCRYPTION_KEY`. Nothing is shared with the old deployment and no key is copied
   from it.
3. **History preserved (D3).** The repository was created with `git filter-repo` from the last
   commit of the old `main` (`925a6c9b`), keeping only the paths that moved. PR references in commit
   messages were rewritten from `#N` to `Juargo/MoneyDiary#N` so they do not link to unrelated
   issues here.
4. **Name (D4).** The product is called **Mirach**: repository `Juargo/mirach`, package scope
   `@mirach/*`. The domain and the app bundle identifier are still to be confirmed; the bundle
   identifier must be fixed before the first store submission because it cannot change afterwards.
5. **Web pieces of the API stay dormant (D5).** Cookie session, CORS, the Sec-Fetch guard, demo
   mode and the Google web OAuth flow are kept with their tests because a web manager may exist
   later. Dormant means switched off in production: empty CORS allowlist and no Google web
   variables. Demo mode gets a configuration switch if it cannot already be disabled.
6. **Documentation that moves (D6).** `docs/adr` (original numbering kept, because code and
   comments cite ADRs by number) and `openspec/specs`. The OpenSpec change archive, task logs,
   sprints and the academic Scrum process stay behind. ADRs that no longer apply are marked as
   historical in the index rather than deleted.
7. **No data migration (D7).** The new database starts empty, with schema and seed data only. No
   script decrypts data with the old key.
8. **iPhone first, Android second (D8).** The iPhone app is built completely before the Android
   app starts, and starts with a small learning slice (login and one read-only screen).
9. **Thin clients (D9).** Business rules (classification, traffic light, 50/30/20) live in the API.
   The apps display and capture; their models and calls are generated from `openapi.json`. When a
   screen needs a business calculation, the calculation is added to the API, not to the app.
   Kotlin Multiplatform is not used.

## Consecuencias

- `openapi.json` becomes the contract of the product: both clients are generated from it, so a
  change to it has to regenerate the clients or break the build.
- Every screen is built and tested twice. A screen catalogue written from the old web and Expo
  screens is the shared specification that keeps both apps aligned.
- The API needs work before store release: account registration, Sign in with Apple and in-app
  account deletion (to be checked against the current store guidelines).
- iOS CI needs macOS runners.
- ADRs about `apps/web`, Expo or the academic scope remain readable but no longer govern code.

## Alternativas consideradas

- **Keep the Expo app (D1).** Rejected by the product owner in favour of native apps.
- **Shared infrastructure (D2).** Rejected: a migration of the product could break the old
  deployment.
- **Clean history (D3).** Rejected: the API history documents why money, encryption and tenant
  isolation code is the way it is.
- **Both platforms in parallel (D8).** Rejected: every design mistake would be paid twice while
  learning two native stacks.
- **Kotlin Multiplatform (D9).** Rejected: a third build chain to learn, justified only by heavy
  client logic such as offline mode.
