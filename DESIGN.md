---
name: Serene Finance
description: Calm pastel finance companion — pastel data fills over a pale blue surface, with a confident cobalt action layer.
colors:
  background: '#e8f0fa'
  foreground: '#1a1c1c'
  card: '#ffffff'
  card-foreground: '#1a1c1c'
  popover: '#ffffff'
  popover-foreground: '#1a1c1c'
  primary: '#2260b2'
  primary-foreground: '#ffffff'
  secondary: '#61597f'
  secondary-foreground: '#ffffff'
  muted: '#f3f3f3'
  muted-foreground: '#44474e'
  accent: '#eeeeee'
  accent-foreground: '#1a1c1c'
  destructive: '#ba1a1a'
  border: '#c4c6cf'
  input: '#c4c6cf'
  ring: '#1a1c1c'
  necesidades: '#8fa7d1'
  gustos: '#b1a7d1'
  ahorro: '#e6d194'
  exceso: '#e88a8a'
  sin-categoria: '#aeb4c4'
  ingreso: '#d1fae5'
  ingreso-foreground: '#065f46'
  semaforo-verde: '#d0fae5'
  semaforo-verde-foreground: '#007a55'
  semaforo-amarillo: '#fef3c6'
  semaforo-amarillo-foreground: '#bb4d00'
  semaforo-rojo: '#ffe4e6'
  semaforo-rojo-foreground: '#c70036'
  semaforo-verde-band: '#5ee9b5'
  semaforo-amarillo-band: '#ffd230'
  semaforo-rojo-band: '#ffa1ad'
  warning: '#fffbeb'
  warning-border: '#fee685'
  warning-foreground: '#973c00'
  warning-accent: '#fef3c6'
  exito-foreground: '#065f46'
typography:
  display:
    fontFamily: 'Inter Variable, system-ui, Segoe UI, Roboto, sans-serif'
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 40px
  headline:
    fontFamily: 'Inter Variable, system-ui, Segoe UI, Roboto, sans-serif'
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  title:
    fontFamily: 'Inter Variable, system-ui, Segoe UI, Roboto, sans-serif'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body:
    fontFamily: 'Inter Variable, system-ui, Segoe UI, Roboto, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label:
    fontFamily: 'Inter Variable, system-ui, Segoe UI, Roboto, sans-serif'
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '36px'
  button-primary-hover:
    backgroundColor: 'rgba(34, 96, 178, 0.9)'
    textColor: '{colors.primary-foreground}'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '36px'
  button-outline-hover:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-foreground}'
  button-ghost-hover:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-foreground}'
  badge-default:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.lg}'
    padding: '20px'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
---

# Design System: Serene Finance

## Overview

**Creative North Star: "Serene Finance"**

A calm, non-bank-like financial companion. The system turns stressful financial data into an approachable monthly verdict: a pale pastel-blue surface (#e8f0fa) holds white cards where soft pastel bucket colors carry the data, while a single confident cobalt (#2260b2) carries every action. Density anxiety is the enemy — generous whitespace, one clear signal per screen, and weight-driven hierarchy keep the experience serene without becoming vague.

The palette is two-tier by doctrine: desaturated pastels (Soft Blue, Lavanda, Pastel Yellow, Coral) exist only as fills for charts, bars, and chips backgrounds; text always uses strong, WCAG-AA foreground colors. The result is soft to look at and precise to read.

**Key Characteristics:**
- Pale blue ambient surface with pure-white cards; depth is tonal, not shadowed.
- Pastel bucket colors as fills only; cobalt primary reserved for actions and active states.
- Weight contrast over size contrast: extrabold verdict figures, semibold labels, regular body.
- Neutral, professional Spanish UI copy; domain vocabulary (cartola, semáforo, buckets) is the interface.

## Colors

Soft pastels differentiate the 50/30/20 buckets while a strong cobalt/lavanda pair does the interactive work.

### Primary
- **Confident Cobalt** (#2260b2): the single action color — filled buttons, links, active nav items, brand mark. 6.21:1 on white. Hover state is the same color at 90% opacity.

### Secondary
- **Deep Lavanda** (#61597f): secondary buttons and resting nav/text accents (~6.5:1 on white). The muted counterpart to cobalt; never competes with it on the same control.

### Bucket Fills (data layer — fills only, never text)
- **Soft Blue / Necesidades** (#8fa7d1): needs bucket — chart wedges, progress fills, dots.
- **Lavanda / Gustos** (#b1a7d1): wants bucket (domain key `Deseos`, UI label "Gustos").
- **Pastel Yellow / Ahorro** (#e6d194): savings bucket.
- **Coral / Exceso** (#e88a8a): over-budget accent (defined, currently unconsumed).
- **Neutral Grey / Sin categoría** (#aeb4c4): the fourth donut wedge for unclassified movements.
- **Mint / Ingreso** (#d1fae5) with **Emerald ink** (#065f46): income fill + its paired text color (6.78:1). The `vinculo-activo` pair duplicates these values deliberately — do not alias them.

### Neutral
- **Ink** (#1a1c1c): primary text and the focus ring (`--ring`), ≥3:1 on any surface.
- **Slate ink** (#44474e): secondary/muted text on white and on #f3f3f3 (~8.9:1).
- **Mist border** (#c4c6cf): card borders, dividers, input strokes.
- **Whisper greys** (#f3f3f3 muted, #eeeeee accent/hover): hover washes and muted chip backgrounds.
- **Pale Sky** (#e8f0fa): the app background — a barely-blue tint that keeps white cards legible as the elevated layer.
- **Alarm Red** (#ba1a1a): destructive actions and errors only.

### Named Rules
**The Two-Tier Color Rule.** Pastel bucket colors are fills, never text. Any text sitting on or near a pastel fill uses a strong AA foreground (Ink, Slate ink, or a paired `-foreground` token). No exceptions.

**The One Action Color Rule.** Cobalt (#2260b2) is the only color that means "you can act here." Bucket pastels never appear on buttons or links.

### Status Families (design-token debt burn-down, 2026-08-27)

Three more `-foreground`-paired families cover semantic states that aren't bucket data, following the same literal-values-not-aliases discipline as `ingreso`/`vinculo-activo`:

- **Semáforo** (`semaforo-verde`/`semaforo-amarillo`/`semaforo-rojo`, each with a `-foreground`): the estado chip pairs for `SemaforoBadge`/`SemaforoTag`/`MiniSemaforoTag` — exact Tailwind v4 default-palette hexes (emerald-100/700, amber-100/700, rose-100/700), all verified AA (4.52:1–5.02:1). A separate `-band` variant (`semaforo-verde-band`/`semaforo-amarillo-band`/`semaforo-rojo-band`, the -300 shades) fills `ZonaBar`'s zone track — fills only, no text, so no `-foreground` pair.
- **Warning** (`warning` surface + `warning-border` + `warning-foreground` + `warning-accent` hover wash): the amber notice family for demo banners, the "sin categoría" callout, and inline validation hints. Unifies what used to be a mix of amber-800/900 text into one `warning-foreground`.
- **Éxito** (`exito-foreground`): the "guardado" success-copy text color across perfil/registro-movimiento forms. Same literal as `ingreso-foreground` (#065f46) but a distinct token — generic success copy must never silently follow the income card's color if that one changes.

The "sin datos" semáforo state (no estado to color) reuses the existing shadcn `muted`/`muted-foreground` pair instead of minting a fourth semáforo token — it isn't a semáforo color, it's the generic neutral-empty state.

**Update (2026-08-29):** the semáforo chip tokens now also wash `SemaforoHeroCard`'s own card surface (`bg-semaforo-verde`/`-amarillo`/`-rojo`, opaque — no alpha overlay) so the dashboard's verdict card visibly wears its estado instead of staying an identical white shell across a green and a red month. Fills only: `text-foreground`/`text-muted-foreground` are unchanged and measure ≥14.2:1 and ≥7.7:1 respectively against every wash. "Sin datos" keeps the neutral `bg-card` surface.

## Typography

**Display Font:** Inter Variable (with system-ui, Segoe UI, Roboto fallbacks)
**Body Font:** Inter Variable (same stack — one family, weight-driven hierarchy)

**Character:** Systematic, legible, modern. Hierarchy comes from weight jumps (400 → 600 → 800), not from a wide size ramp.

> **Landing exception (2026-08-07, PR #240):** the public landing (`apps/landing`) uses **DM Sans** (body) and **Plus Jakarta Sans** (headings) with dark blue ink (#022030 / #435e6d). That pairing is a candidate for product-wide adoption; until decided, app surfaces stay on Inter.

### Hierarchy
- **Display** (800, 36px/40px): the money — verdict figures on SemaforoHeroCard and IngresoCard only.
- **Headline** (700, 24px/32px): page titles ("Semáforo").
- **Title** (600, 14px/20px): card subheads and dialog titles.
- **Body** (400, 14px/20px): default text; meta text drops to 12px in `muted-foreground`.
- **Label** (600, 12px/16px, letter-spacing 0.1em, UPPERCASE): section eyebrows in `secondary`.

### Named Rules
**The Verdict Scale Rule.** 36px extrabold is reserved for the number that answers "¿estoy bien este mes?" — one per screen, maximum. Everything else stays at 24px or below.

## Layout

Single-breakpoint responsive shell, pure CSS (no JS media queries):

- **Desktop (≥1024px / `lg`):** fixed 256px sidebar on the left (`w-64`, white card surface, right border); main content clears it with `lg:pl-64`.
- **Mobile (<1024px):** sidebar hidden; fixed 64px bottom tab bar (`h-16`); main content reserves `pb-16`.
- **Content column:** centered `max-w-6xl` (1152px) with 16px padding and 24px vertical gaps between cards.
- **Rhythm:** Tailwind 4px base scale in practice — 20px padding on the card recipe (`p-5`), 12–16px inside dialogs and rows, 24px between modules so each financial category has room to breathe.

## Elevation & Depth

The system is **flat with a single tonal step**. Depth is conveyed by surface color (pale blue background → white cards) and 1px Mist borders, not by shadow drama. `shadow-sm` is the universal card/dialog shadow; nothing floats higher except popovers.

### Shadow Vocabulary
- **Resting card** (`shadow-sm`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): cards, inline confirmation dialogs, list-item cards.
- **Popover** (`shadow-md`: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): the only elevated overlay in the system.
- **Outline button** (`shadow-xs`: `0 1px 2px 0 rgb(0 0 0 / 0.05)`): the faintest possible lift.

### Named Rules
**The One Step Up Rule.** Everything rests at `shadow-sm`; only transient overlays (popovers) take one step up to `shadow-md`. Nothing uses `shadow-lg` or beyond.

## Shapes

The whole radius family derives from a single `--radius: 0.5rem` token: buttons and inputs at 6px (`md`); cards, inline dialogs and nav items at 8px (`lg`). The `xl` (12px) step remains in the token scale but no shipped card consumes it — the container stays at least as soft as its contents. Badges and the semáforo icon circle go fully round (`9999px`). Borders are 1px Mist everywhere; the active sidebar item carries a 4px cobalt accent edge (`border-r-4`).

## Components

### Buttons
- **Shape:** gently rounded (6px), 36px default height, 14px medium text.
- **Primary:** Confident Cobalt fill, white text, hover at 90% opacity.
- **Outline:** white/background fill, 1px Mist border, `shadow-xs`, hover washes to `accent` (#eeeeee).
- **Secondary:** Deep Lavanda fill, white text, hover at 80% opacity.
- **Ghost / Link:** transparent; ghost hovers to `accent`, link underlines in cobalt (underline-offset 4px).
- **Destructive:** Alarm Red fill, white text.
- **Focus:** 3px ring in `ring/50` plus `border-ring` — the shared focus grammar for every interactive element.
- **Sizes:** xs 24px · sm 32px · default 36px · lg 40px, with square icon variants at each step.

### Badges / Chips
- **Style:** fully pill-shaped (`rounded-full`), 12px medium text, 2px/8px padding.
- **Variants:** mirror button colors (default cobalt, secondary lavanda, destructive red, outline with Mist border, ghost hover-only).

### Cards / Containers
- **Corner Style:** 8px (`rounded-lg`) via the shared `DASHBOARD_CARD_CLASS` recipe (`apps/web/src/lib/dashboard-card.ts`) — the single source of truth for the card shell on the flagship surfaces.
- **Background:** pure white on the Pale Sky app background.
- **Shadow Strategy:** `shadow-sm` + 1px Mist border (see Elevation).
- **Internal Padding:** 20px (`p-5`), with 24px gaps between stacked cards.
- **Note (2026-08-29):** the shipped 8px/20px card is a deliberate decision; the shadcn `Card` primitive (`components/ui/card.tsx`, 12px/24px) predates it and is currently imported nowhere. Do not "correct" surfaces back to the primitive's spec.

### Inputs / Fields
- **Style:** 6px radius, 1px `input` (#c4c6cf) stroke, 8px/12px padding, 14px text, white or transparent background.
- **Focus:** `border-ring` + 3px `ring/50` — same grammar as buttons (the shared `CampoTexto` pattern is normative).
- **Error / Disabled:** `aria-invalid` switches border and ring to destructive tints; disabled drops to 50% opacity.

### Navigation
- **Sidebar item:** 8px radius row, 14px medium Deep Lavanda text, hover `accent` wash; **active** = cobalt text, semibold, `accent` fill, 4px cobalt accent edge.
- **Bottom tab:** icon-over-label column, 12px medium text; active = cobalt + semibold (no fill).
- **Brand block:** 18px semibold cobalt "MoneyDiary" + 12px muted tagline.

### Inline Confirmation Dialog (signature component)
Confirmations render as an inline, non-modal `role="alertdialog"` card in document flow — **no overlay, no portal** (a deliberate calm-over-drama choice): 8px radius, white card, 1px Mist border, `shadow-sm`, 12–16px padding, title in Title style, actions right-aligned. Focus moves into the dialog on open and Escape closes it (both hand-managed). One shared component (`apps/web/src/components/ui/inline-confirm.tsx`) implements this recipe — every destructive/impact confirmation composes it rather than hand-rolling the shell again; Cancelar/Confirmar render at the house default 36px touch target (Button's `default` size), never `sm`/`xs`.

## Do's and Don'ts

### Do:
- **Do** use bucket pastels exclusively as fills (chart wedges, bars, dots) with strong AA text beside them — the Two-Tier Color Rule.
- **Do** route every focus state through `--ring` (#1a1c1c) with the 3px `ring/50` grammar; it is the one shared interaction signature.
- **Do** keep `bucket-colors.ts` and `index.css` bucket hexes in sync when either changes — there is no automated gate.
- **Do** label the `Deseos` bucket as **"Gustos"** in UI copy via `ETIQUETA_BUCKET`; the API keeps `Deseos`.
- **Do** reserve 36px extrabold for the single verdict/money figure per screen.

### Don't:
- **Don't** put white or pastel text on bucket pastels — every pastel fails AA as a text background.
- **Don't** introduce new ad-hoc Tailwind palette colors (amber/emerald/rose/slate literals) for semantic states — the semáforo, warning, and éxito tokens above exist precisely to cover those states; use them instead of a fresh literal.
- **Don't** elevate anything past `shadow-md`, and reserve `shadow-md` for popovers.
- **Don't** hand-roll a new confirmation dialog; compose the shared `InlineConfirm` component (`ui/inline-confirm.tsx`) instead — it owns the shell (8px radius, Mist border, `shadow-sm`, no overlay), Escape/focus handling, and the house default 36px Cancelar/Confirmar buttons, never `sm`/`xs`.
- **Note:** dark mode is unimplemented by decision — there is no theme toggle. The inert `.dark` override block and the unused `--font-mono` token were removed from `index.css` (design-token debt burn-down, 2026-08-27); git history keeps them if that decision ever reverses.
