# Monetization: Plus plan, backend grants and store billing

Objective: charge for Plus (monthly, yearly and the one-time Fundador purchase) through RevenueCat, with the API as the source of truth for entitlements, a 30-day trial granted by the backend and lifetime grants for the Android testers. Branch: `feat/monetizacion-plus`. Delivery: `ask-on-risk`; the forecast is far above 400 changed lines, so the chain strategy is asked before the second commit. Runners: API `pnpm api test`, `pnpm api lint:ci`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check`, `pnpm api env:example:check`, `pnpm api build`; integration `pnpm api test:integration` (local Postgres, `pnpm api db:up`).

## Specs

- **S1** Model, quoted: "plan gratis + plan **Plus** por suscripción, con 30 días de prueba Plus al registrarse." "**Gratis:** mes actual, 2 bancos, registro a mano, reclasificar, perfiles predefinidos y exportar." "**Plus:** los 4 bancos a la vez, historial de meses, perfiles propios, categorías y patrones propios."
- **S2** Price, quoted: "Plus a **$1.990 al mes o $14.990 al año** (≈ $1.250 al mes). Reemplaza el rango de $3.490–$3.990 de PLA-03." Prices live in the stores (ADR-012 §2); the repo only records them in the requirements.
- **S3** Billing, quoted: "compras dentro de la app de Apple y Google. El plan vale en ambas plataformas con la misma cuenta." "¿RevenueCat o validación de recibos propia? → **RevenueCat** (decidido 26-11-2026)."
  - API: `POST /api/webhooks/revenuecat`, authenticated with a secret in `Authorization`, processed once per event id (ADR-012 §1). `appUserID` is the internal user id.
- **S4** Expiry, quoted: "**Al vencer el plan no se borra nada**, solo se aplican los límites del gratis."
- **S5** Entitlement question, quoted: "La app pregunta al backend "¿este usuario tiene Plus?". La respuesta es sí si tiene una suscripción vigente **o** un permiso concedido."
  - API: `GET /api/plan`, behind the session, scoped by `userId`.
  - Data model suggested by the user, quoted: "una tabla de permisos con `user_id`, `entitlement = plus`, `source = store | grant`, `reason = tester_vitalicio`, `granted_at` y `expires_at = null`."
- **S6** Trial. Decided by the user on 2026-11-26, quoted: "la concede el backend sin tarjeta". It replaces ADR-012 §3 (store introductory offer). It is a grant with an expiry 30 days after it starts. **Open:** the moment it starts for an anonymous account and for accounts that exist when billing is turned on.
  - PLA-09, quoted from the requirements: "Tu prueba Plus termina en 3 días"; the API computes it.
- **S7** Testers, quoted: "solo los testers de Android (unos 4) reciben Plus vitalicio. Fecha de corte: los inscritos al momento de activar el cobro; quien se sume después no lo recibe." "El vitalicio de testers se guarda igual en la base propia y se refleja como permiso promocional en RevenueCat." "Cada tester necesita una cuenta (Apple ID o Google) antes de activar el permiso."
- **S8** Fundador, quoted: "se ofrece, con 100 cupos a $39.990." "Pago único que da Plus de por vida, con cupos limitados y solo durante el lanzamiento." "Es una compra única no consumible en cada tienda, y la app deja de mostrarla cuando el backend cuenta las ventas acordadas."
- **S9** Free plan limits are enforced by the API (ADR-006): 2 banks (IMP-24), current month only, predefined profiles only, and creating or editing categories and patterns is Plus (CLA-09). Reading and exporting are never blocked (S4).
- **S10** Apps (iOS and Android): RevenueCat SDK, a plans screen with the three products, plan status with renewal date and how to cancel (PLA-04), restore purchases (PLA-05). The contract is `apps/api/openapi.json`; clients are regenerated.
- **S11** Landing, quoted: "Hosting de la landing → **Cloudflare Pages** (decidido 26-11-2026)." "Los formularios (lista de espera, soporte, borrado de cuenta) deben apuntar a la API en Render". "El dominio mirachbudget.app se conecta como dominio propio."
- **S12** Out of scope, quoted: "**Propina opcional** ... **queda para después del lanzamiento**"; "**Descartado:** publicidad y comisiones por productos financieros"; "LAN-04 (puerta falsa de precios en la landing) → Descartada".
- **S13** Owned by the user in each console, not by this branch: Supabase Pro, Render Starter, App Store Small Business Program, the RevenueCat project, the three products in App Store Connect and Play Console, reading Cloudflare's terms, the written conditions of the lifetime and Fundador benefits, and applying Prisma migrations to production (additive: before the merge).

## Tasks

- [x] **T1** (S2, S6, S7, S8) Docs: ADR-015 amending ADR-012, PLA-02/PLA-03 and the new requirements. Route: inline.
- [ ] **T2** (S4, S5) API: `Suscripcion` and `PermisoPlan` tables, the domain rule for the effective plan and `GET /api/plan`. Route: inline. Risk: none expected (new tables, new route).
- [ ] **T3** (S3, S8) API: RevenueCat webhook, idempotent, mapping subscriptions and the Fundador purchase. Route: inline. Risk: item 2 (webhook authentication), own commit.
- [ ] **T4** (S6) API: trial grant and the PLA-09 notice. Blocked on the open point of S6.
- [ ] **T5** (S8) API: Fundador seats (count of sales against 100, exposed to the apps).
- [ ] **T6** (S7) API: script that grants lifetime Plus to a user, mirrored as a promotional entitlement in RevenueCat.
- [ ] **T7** (S9) API: enforce the free plan limits. Risk: item 3 (changes what existing routes accept).
- [ ] **T8** (S10) iOS.
- [ ] **T9** (S10) Android.
- [ ] **T10** (S11) Landing on Cloudflare Pages.
- [ ] **T11** (S3) Privacy policy and store listings declare RevenueCat (ADR-012, consequences).

## Log

- **L1** (2026-11-26) Original request, verbatim: "En esta sesi´ón trabajemos en la implementaci´ón del sistema de monetizaci´ón seg´ún el plan actual", followed by the pasted note "Mirach — Monetización e infraestructura" (session of 26-11-2026, status "🟡 En discusión"). Its decided sections are quoted in S1 to S12; its section 6, verbatim:
  1. "**Ya:** Supabase Pro. Ya hay datos reales de testers y hoy no tienen backup."
  2. "**Antes de activar el cobro:** Render Starter, migrar la landing a Cloudflare Pages, inscripción en Small Business Program, integrar RevenueCat, y crear en App Store Connect y Play Console los tres productos (mensual, anual y Fundador)."
  3. "**Al activar el cobro:** conceder Plus vitalicio a los testers de Android, encender la prueba de 30 días para usuarios nuevos y abrir los 100 cupos del Fundador."
  4. "**Después:** medir conversión de prueba a pago y ajustar el precio dentro del rango."
- **L2** (2026-11-26) Repo state found: nothing of billing exists. `GET /api/config` exposes `planGratis` (`bancosMaximos`, `soloMesActual`) but no route enforces it. ADR-012 already decides RevenueCat, the webhook, `Suscripcion` and `GET /api/plan`. The landing is static (`apps/landing/astro.config.ts`, `output: 'static'`, no adapter).
- **L3** (2026-11-26) Question asked: store introductory offer (ADR-012 §3) or backend trial. Answer, verbatim: "la concede el backend sin tarjeta".
- **L4** (2026-11-26) Order agreed by default (proposed, not objected): API entitlements, API limits, apps, landing. RDD is off (`gentle-ai review mode status`: off, decided by global).
