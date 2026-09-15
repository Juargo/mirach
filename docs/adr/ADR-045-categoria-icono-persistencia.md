---
tags:
  - adr
  - fase-diseño
  - backend
  - dominio
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-09-15
fecha_actualizacion: 2026-09-15
---

# ADR-045 — Category icons: persisted curated lucide allowlist

## Estado

✅ **Decidido** (2026-09-15) — `Categoria` gets a nullable `icono` column validated against a
curated domain allowlist. Change SDD `categoria-iconografia` (this ADR, the migration, the
allowlist VO and the seed defaults ship in PR1; use cases/contract/clients follow in PR2–PR7).

## Contexto

`Categoria` has no visual identity beyond name and bucket color (`apps/web`'s prior attempt,
`lib/category-icons.ts`, is dead code — deleted later in this change). Persisted server-side is
the sanctioned path (ADR-024: domain canonical lives once in the backend). Open questions: what
decides validity (DB `CHECK`, zod enum, or a domain VO), what happens to existing rows, and what
happens when a curated name is later retired.

## Decisión

1. **D-01 — `Categoria.icono String?`** (nullable `TEXT`, no `CHECK`). The domain allowlist
   (`domain/value-objects/icono-categoria.ts`: `ICONOS_CATEGORIA` as const, `IconoCategoria`,
   `esIconoCategoria`) is the SOLE validity authority — infra may import domain (ADR-005), and
   this vocabulary is consumed by two use cases (PR2) **and** `catalogo-template.ts`, so one
   source beats an application-local copy. Rejected: a zod enum as sole validator (would force
   `application` to import `infrastructure`, backwards for ADR-005, or duplicate the list).
2. **D-02 — wire value is the lucide kebab name** (`shopping-cart`), never PascalCase or emoji
   (ADR-027 stays library-only, not amended).
3. **D-03 — no DB `CHECK`.** Rejected as the primary validator: it would couple every allowlist
   edit to a manual, deploy-order-coupled migration; the domain is already the authority.
4. **D-04 — read model is `icono: string | null`**, decoupled from the write-time
   `IconoCategoria` type — a retired name must not become a type lie or a `500`; clients fall
   back for any name they don't recognize.
5. **D-05 — the client-only fallback glyph is NOT in the allowlist** — keeps `null` ("no icon")
   distinct from a real choice.
6. **D-06 — the 8 `catalogo-template.ts` categories ship default icons**, copied verbatim by
   every catalog-materializing entry point sharing `copiarCatalogoTemplate`/`CATEGORIA_TEMPLATE`
   (bootstrap seed, demo user, Google signup-on-first-login — ADR-041): Supermercado
   `shopping-cart`, Combustible `fuel`, Farmacia `pill`, Salud `heart-pulse`, Transporte `bus`,
   Streaming `tv`, Delivery `bike`, Ahorro `piggy-bank`. **No backfill** — a pre-existing
   `Categoria` row keeps `icono: NULL`.
7. **D-09 — the bootstrap seed sets `icono` in `create` only, never `update`.** The seed's
   `userId: USER_ID_FIJO` account is the owner's real production account; a re-run must not
   clobber a hand-picked icon (same `create`-only treatment the seed already gives `userId`).
8. **D-10 — this ADR is new; ADR-027 stays library-only.** ADR-027 picked the icon library; this
   ADR picks the valid subset, its authority, and its schema-evolution story. Neither amends the
   other.

**Allowlist (24):** `shopping-cart, fuel, pill, heart-pulse, bus, house, zap, wifi, smartphone,
graduation-cap, shield, car, paw-print, tv, bike, utensils, shirt, plane, gamepad-2, gift,
dumbbell, piggy-bank, trending-up, credit-card` — verified against the real exports of
`lucide-react@0.469.0`/`lucide-react-native@1.31.0`; deprecated aliases (`home`, `play-circle`)
excluded in favor of their canonical names. Emoji/free-text rejected outright by ADR-027.

**D-11 (contract note, later PR).** The HTTP response field will be `.nullable().optional()` in
the generated wire TYPE even though the server always emits the key at runtime — a CI-driven
widening so pre-existing client fixtures need no churn. Enforced by route tests, not this ADR.

## Security and consequences

No new endpoint or credential — `icono` travels through `POST/PATCH /api/categorias` under the
same owner-scoped gate every `Categoria` mutation uses (RNF-SEC-006; PR2 extends the gate).
ADR-013 does not apply (non-sensitive UI preference, no blind index).
`IconoCategoriaInvalidoError.rawValue` is never echoed, mirroring the project's monetary-value
scrub discipline. Single source of truth for icon validity, no domain/infra duplication; adding
or retiring an icon is a one-file, zero-migration change (D-01/D-03); the migration itself is a
pure additive `ALTER TABLE ... ADD COLUMN`, no backfill; seed idempotency preserved (D-09).
Trade-off: client parity needs an explicit guard — the web/mobile mirror specs (PR3b/PR3c) fail
loudly on drift; retiring a name is a soft delete (rows keep the old string until an explicit
backfill clears them, rendering the fallback meanwhile).

## Out of scope / References

Out of scope here: use-case wiring, repository mapping, `ICONO_INVALIDO` HTTP mapping (PR2/PR3a);
client icon maps, pickers, badges (PR3b–PR7); a dedicated icon endpoint (YAGNI); applying the
migration to production (manual, human-gated `prisma migrate deploy`). References: ADR-005 ·
ADR-013 · ADR-024 · ADR-027 (not amended) · ADR-036/037 · ADR-041 · change SDD
`categoria-iconografia` (`openspec/changes/categoria-iconografia/`).
