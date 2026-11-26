# Monetization: Plus plan, backend grants and store billing

Objective: charge for Plus (monthly, yearly and the one-time Fundador purchase) through RevenueCat, with the API as the source of truth for entitlements, a 30-day trial granted by the backend and lifetime grants for the Android testers. Branch: `feat/monetizacion-plus`. Delivery: `ask-on-risk`, chain strategy `stacked-to-main` (decided by the user on 2026-11-26); each slice is its own branch `feat/monetizacion-plus-NN-<slice>` built on the previous one. Push and PR creation stay with the user. Runners: API `pnpm api test`, `pnpm api lint:ci`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check`, `pnpm api env:example:check`, `pnpm api build`; integration `pnpm api test:integration` (local Postgres, `pnpm api db:up`).

## Specs

- **S1** Model, quoted: "plan gratis + plan **Plus** por suscripción, con 30 días de prueba Plus al registrarse." "**Gratis:** mes actual, 2 bancos, registro a mano, reclasificar, perfiles predefinidos y exportar." "**Plus:** los 4 bancos a la vez, historial de meses, perfiles propios, categorías y patrones propios."
- **S2** Price, quoted: "Plus a **$1.990 al mes o $14.990 al año** (≈ $1.250 al mes). Reemplaza el rango de $3.490–$3.990 de PLA-03." Prices live in the stores (ADR-012 §2); the repo only records them in the requirements.
- **S3** Billing, quoted: "compras dentro de la app de Apple y Google. El plan vale en ambas plataformas con la misma cuenta." "¿RevenueCat o validación de recibos propia? → **RevenueCat** (decidido 26-11-2026)."
  - API: `POST /api/webhooks/revenuecat`, authenticated with a secret in `Authorization`, processed once per event id (ADR-012 §1). `appUserID` is the internal user id.
- **S4** Expiry, quoted: "**Al vencer el plan no se borra nada**, solo se aplican los límites del gratis."
- **S5** Entitlement question, quoted: "La app pregunta al backend "¿este usuario tiene Plus?". La respuesta es sí si tiene una suscripción vigente **o** un permiso concedido."
  - API: `GET /api/plan`, behind the session, scoped by `userId`.
  - Data model suggested by the user, quoted: "una tabla de permisos con `user_id`, `entitlement = plus`, `source = store | grant`, `reason = tester_vitalicio`, `granted_at` y `expires_at = null`."
- **S6** Trial. Decided by the user on 2026-11-26, quoted: "la concede el backend sin tarjeta". It replaces ADR-012 §3 (store introductory offer). It is a grant with an expiry 30 days after it starts. It starts, quoted (2026-11-26): "al crear la cuenta, anónima incluida". Accounts that already exist when billing is turned on get their 30 days from that day (stated with the question, not objected).
  - PLA-09, quoted from the requirements: "Tu prueba Plus termina en 3 días"; the API computes it.
- **S7** Testers, quoted: "solo los testers de Android (unos 4) reciben Plus vitalicio. Fecha de corte: los inscritos al momento de activar el cobro; quien se sume después no lo recibe." "El vitalicio de testers se guarda igual en la base propia y se refleja como permiso promocional en RevenueCat." "Cada tester necesita una cuenta (Apple ID o Google) antes de activar el permiso."
- **S8** Fundador, quoted: "se ofrece, con 100 cupos a $39.990." "Pago único que da Plus de por vida, con cupos limitados y solo durante el lanzamiento." "Es una compra única no consumible en cada tienda, y la app deja de mostrarla cuando el backend cuenta las ventas acordadas."
- **S9** Free plan limits are enforced by the API (ADR-006): 2 banks (IMP-24), current month only, predefined profiles only, and creating or editing categories and patterns is Plus (CLA-09). Reading and exporting are never blocked (S4).
- **S10** Apps (iOS and Android): RevenueCat SDK, a plans screen with the three products, plan status with renewal date and how to cancel (PLA-04), restore purchases (PLA-05). The contract is `apps/api/openapi.json`; clients are regenerated.
- **S11** Landing, quoted: "Hosting de la landing → **Cloudflare Pages** (decidido 26-11-2026)." "Los formularios (lista de espera, soporte, borrado de cuenta) deben apuntar a la API en Render". "El dominio mirachbudget.app se conecta como dominio propio."
- **S12** Out of scope, quoted: "**Propina opcional** ... **queda para después del lanzamiento**"; "**Descartado:** publicidad y comisiones por productos financieros"; "LAN-04 (puerta falsa de precios en la landing) → Descartada".
- **S13** Owned by the user in each console, not by this branch: Supabase Pro, Render Starter, App Store Small Business Program, the RevenueCat project, the three products in App Store Connect and Play Console, reading Cloudflare's terms, the written conditions of the lifetime and Fundador benefits, and applying Prisma migrations to production (additive: before the merge).

## Tasks

- [x] **T1** (S2, S6, S7, S8) Docs: ADR-015 amending ADR-012, PLA-02/PLA-03, PLA-10, PLA-11, LAN-04 discarded. Route: inline. Commit `f660d407`.
- [x] **T2** (S4, S5) API: the domain rule for the effective plan, the `Suscripcion` and `PermisoPlan` tables (account deletion and merge handle the new rows) and `GET /api/plan` with the Swift and Kotlin clients regenerated. Route: inline. Three slices, see Slices. Risk: item 3 on slice 03 (the deletion and merge transactions are shared with existing routes). Pending proof: `test/plan.e2e-spec.ts` and the integration suite were not run locally (Docker stopped, no `apps/api/.env.test`); CI runs them.
- [ ] **T3** (S3, S8) API: RevenueCat webhook, idempotent and ordered, mapping subscriptions, the Fundador purchase and transfers. Route: inline. Three slices (05 to 07), see Slices. Risk: item 2 (the webhook authenticates with its own secret, outside the api-key middleware) and item 4 (events arrive late or twice). Own checks done (L8); open until the independent verifier returns.
- [ ] **T4** (S6) API: the 30-day trial and the PLA-09 notice. Design: the trial is derived, not stored: it runs from the later of the account's creation and the day billing was turned on (a new env date), for a configurable number of days; while that date is unset every account has Plus ("Plus gratis durante el lanzamiento", ADR-012). A stored `prueba` grant overrides the derived one. ADR-015 §3 is amended. Route: inline.
- [ ] **T5** (S8) API: Fundador seats (count of sales against 100, exposed to the apps).
- [ ] **T6** (S7) API: script that grants lifetime Plus to a user, mirrored as a promotional entitlement in RevenueCat.
- [ ] **T7** (S9) API: enforce the free plan limits. Risk: item 3 (changes what existing routes accept).
- [ ] **T8** (S10) iOS.
- [ ] **T9** (S10) Android.
- [ ] **T10** (S11) Landing on Cloudflare Pages.
- [ ] **T11** (S3) Privacy policy and store listings declare RevenueCat (ADR-012, consequences).
- [ ] **T12** (S3) API: reconcile with the RevenueCat REST API (ADR-012 §2) for what the webhook cannot resolve: an event whose users no longer exist (after an account merge or deletion) and the daily check of subscriptions that expire. Also the `SuscripcionCambiada` event for the KPIs (ADR-012 §4).

## Slices

Stacked to `main`, in order. Authored lines exclude `openapi.json` and the generated clients.

| # | Branch | Holds | Commit | Authored lines |
|---|--------|-------|--------|----------------|
| 01 | `feat/monetizacion-plus-01-adr` | T1 | `f660d407` | 146 |
| 02 | `feat/monetizacion-plus-02-regla-plan` | T2: domain rule | `1df030f8` | 355 |
| 03 | `feat/monetizacion-plus-03-tablas` | T2: tables, reader, deletion and merge | `ca8aa885` | 274 |
| 04 | `feat/monetizacion-plus-04-api-plan` | T2: use case, `GET /api/plan`, contract, clients, e2e | `2a014908` | about 450 |
| 05 | `feat/monetizacion-plus-05-eventos-revenuecat` | T3: RevenueCat event mapper and the use case | `57476008` | 801 (about 480 are tests) |
| 06 | `feat/monetizacion-plus-06-escritor-derechos` | T3: processed-events table and the transactional writer | `3a523a75` | 714 (about 380 are tests) |
| 07 | `feat/monetizacion-plus-07-webhook-revenuecat` | T3: `POST /api/webhooks/revenuecat`, env variables, render.yaml | `05751efc` | 432 (about 270 are tests) |

Slices 03 and 06 carry a migration each: it is applied to production before its PR merges. Slices 05 to 07 are above 400 lines after one slicing pass because their tests outweigh the code; `size:exception` is recommended instead of splitting tests from the code they prove.

## Log

- **L1** (2026-11-26) Original request, verbatim: "En esta sesi´ón trabajemos en la implementaci´ón del sistema de monetizaci´ón seg´ún el plan actual", followed by the pasted note "Mirach — Monetización e infraestructura" (session of 26-11-2026, status "🟡 En discusión"). Its decided sections are quoted in S1 to S12; its section 6, verbatim:
  1. "**Ya:** Supabase Pro. Ya hay datos reales de testers y hoy no tienen backup."
  2. "**Antes de activar el cobro:** Render Starter, migrar la landing a Cloudflare Pages, inscripción en Small Business Program, integrar RevenueCat, y crear en App Store Connect y Play Console los tres productos (mensual, anual y Fundador)."
  3. "**Al activar el cobro:** conceder Plus vitalicio a los testers de Android, encender la prueba de 30 días para usuarios nuevos y abrir los 100 cupos del Fundador."
  4. "**Después:** medir conversión de prueba a pago y ajustar el precio dentro del rango."
- **L2** (2026-11-26) Repo state found: nothing of billing exists. `GET /api/config` exposes `planGratis` (`bancosMaximos`, `soloMesActual`) but no route enforces it. ADR-012 already decides RevenueCat, the webhook, `Suscripcion` and `GET /api/plan`. The landing is static (`apps/landing/astro.config.ts`, `output: 'static'`, no adapter).
- **L3** (2026-11-26) Question asked: store introductory offer (ADR-012 §3) or backend trial. Answer, verbatim: "la concede el backend sin tarjeta".
- **L4** (2026-11-26) Order agreed by default (proposed, not objected): API entitlements, API limits, apps, landing. RDD is off (`gentle-ai review mode status`: off, decided by global).
- **L5** (2026-11-26) T2 evidence. RED: `plan.spec.ts` and `obtener-plan.use-case.spec.ts` failed on the missing module before the code existed. GREEN: `pnpm api test` 3708 passed; `lint:ci` 0 errors; `tsc --noEmit`, `openapi:check`, `env:example:check` and `build` clean. Mutation: removing the `notIn` filter and the destination guard of `moverDerechosPlus` turns two merge tests red. `GET /api/plan` answers `{ plan, origen, venceEn, renueva, producto, tienda }`; T4 and T5 add fields before any app reads the route.
- **L6** (2026-11-26) Left for later tasks. T3: a merge moves the subscription to the destination, but RevenueCat keeps the origin id as `app_user_id`, so the webhook must resolve a user that no longer exists (aliases or a transfer). T8/T9: deleting an account removes its rows but does not cancel the store subscription; the apps must say so before deleting. A deleted Fundador account frees its seat.
- **L7** (2026-11-26) Question asked: stacked PRs to `main` or a chain on the feature branch. Answer, verbatim: "PRs apilados contra main". The single T2 commit was split into slices 02 to 04; slice 03 was checked alone (`tsc`, `lint:ci`, 3704 unit tests, `openapi:check`).
- **L8** (2026-11-26) T3 evidence. RevenueCat docs read on 2026-11-26 (webhooks, event types and fields, event flows, sample events): 200 is the only success status, up to 5 retries over about 80 minutes, duplicates are possible, order is not guaranteed, a refund is `CANCELLATION` with `cancel_reason` `CUSTOMER_SUPPORT`, a lifetime purchase is `NON_RENEWING_PURCHASE` with `expiration_at_ms` null, `TRANSFER` carries `transferred_from` and `transferred_to` and no `app_user_id`. RED was observed for the mapper, the use case, the writer (integration) and the route (e2e, 19 of 20 failing) before each existed. GREEN on a throwaway local Postgres 17: `pnpm api test` 3761, integration suite 309, e2e suite 177 (this also proves `test/plan.e2e-spec.ts`, pending in T2); `lint:ci` 0 errors, `tsc`, `openapi:check`, `env:example:check`, `build` clean. Mutation: accepting any `Authorization` turns 6 webhook tests red.
- **L9** (2026-11-26) Decisions in T3. The webhook is left out of `openapi.json`: that file generates the app clients, the Kotlin generator rejects the open-ended event body and the 401 family test expects the app error codes; a contract test pins the absence. The webhook checks the `Authorization` secret only; RevenueCat's optional HMAC signature (`X-RevenueCat-Webhook-Signature`, raw body) is not used. Sandbox events are applied like production ones, so App Review and testers can buy; T5 must decide whether sandbox Fundador purchases count against the 100 seats. A transfer moves only what was bought (subscription and Fundador); the trial and the tester grant stay with the account.
- **L10** (2026-11-26) Question asked: the trial starts when the account is created (anonymous included) or when it is linked to Apple or Google. Answer, verbatim: "al crear la cuenta, anónima incluida". T4 is unblocked; it starts after the independent verifier of T3 returns, because both work on `apps/api` in the same tree.
