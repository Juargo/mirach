# Web App UI Specification (apps/web)

## Purpose

Dashboard drill-down: clicking a bucket in the 50/30/20 pie/legend shows only
that bucket's transactions, grouped by the finer `categoria` exposed by
`categorias-api`, with an active reclassify control (replacing the earlier
disabled "Editar categoría" / "Clasificar" placeholders).

## Requirements

### Requirement: WCAT-01 — Clicking a bucket shows only that bucket's transactions

Clicking a pie slice or legend entry MUST swap the dashboard's right panel to
show ONLY the clicked bucket's transactions for the selected period — not all
buckets at once.

#### Scenario: Clicking Deseos shows only Deseos transactions

- GIVEN the dashboard is showing the default/no-selection state
- WHEN the user clicks the Deseos pie slice
- THEN the panel shows only Deseos transactions, none from other buckets

### Requirement: WCAT-02 — Panel groups the bucket's transactions by categoría

Within the selected bucket's panel, transactions MUST be grouped by
`categoria` (from `categorias-api`'s DTO field). Each group header MUST show
the categoría name, its transaction count, and its exact subtotal (from
string/BigInt amounts, never `Number()`/`parseFloat()`). Rows with no
categoría (SinCategoria bucket, or an unmatched row) render under a
"Sin categoría" group.

#### Scenario: Necesidades panel groups by its 5 categorías

- GIVEN Necesidades has transactions in Supermercado, Farmacia, and Transporte
  this period
- WHEN the panel renders
- THEN exactly those 3 categoría groups appear, each with its own count and
  exact subtotal

#### Scenario: Subtotal precision survives large amounts

- GIVEN a group contains a transaction beyond `Number.MAX_SAFE_INTEGER`
- WHEN the group's subtotal is computed
- THEN every digit is preserved (BigInt/integer arithmetic, not float)

### Requirement: WCAT-03 — Empty states are preserved

If the selected bucket has zero transactions this period, the panel MUST show
the existing empty state (not a broken/empty grouped list). If the whole
period has zero transactions, the existing period-empty state MUST still
render before any bucket is selected.

#### Scenario: A bucket with zero transactions this period shows the empty state

- GIVEN Ahorro has zero transactions this period
- WHEN the user clicks the Ahorro pie slice
- THEN the panel shows the existing "no movements" empty state

### Requirement: WCAT-04 — Reclassify control is active and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder:
activating it MUST let the user choose a categoría (offered as ALL
categorías, grouped by bucket) and call the `categorias-api` reclassify
endpoint. When the chosen categoría's bucket differs from the transaction's
current bucket, the control MUST show a confirmation naming the exact money
move (e.g. "Esto mueve $X de Deseos a Necesidades") before committing;
same-bucket reclassification MUST commit immediately without a confirmation
step. On success, the panel's transaction list AND the resumen
(pie/traffic-light) MUST refresh to reflect the new categoría/bucket. The
SinCategoria "Clasificar" CTA MUST behave the same way (assign a categoría to
an unclassified row) via the same control.

#### Scenario: A successful within-bucket reclassify updates the group counts

- GIVEN a transaction shown under "Delivery" in the Deseos panel
- WHEN the user reclassifies it to "Streaming" via the control
- THEN it commits immediately (no confirmation dialog), moves to the
  "Streaming" group, and both groups' counts/subtotals update, with no
  change to the Deseos pie slice

#### Scenario: A cross-bucket reclassify requires confirmation and then updates the resumen

- GIVEN a transaction shown under Deseos is being reclassified to a
  Necesidades categoría
- WHEN the user selects the target categoría
- THEN a confirmation naming the money move is shown before anything commits
- WHEN the user confirms
- THEN the transaction disappears from the Deseos panel and the
  resumen/traffic-light reflects the updated bucket totals

#### Scenario: Cancelling a cross-bucket confirmation leaves the UI unchanged

- GIVEN the cross-bucket confirmation dialog is showing
- WHEN the user cancels (or presses Escape)
- THEN no request is sent and the transaction stays in its original group

#### Scenario: A failed reclassify leaves the UI unchanged

- GIVEN the reclassify endpoint returns an error (e.g. cross-tenant/invalid
  categoría)
- WHEN the user attempts the reclassify
- THEN the transaction stays in its original group and an error is
  communicated to the user

### Requirement: WCAT-05 — Reclassify control is accessible (ADR-018, WCAG 2.2 AA)

The reclassify control (and the SinCategoria "Clasificar" CTA) MUST be
operable by keyboard alone and MUST expose an accessible name that identifies
which transaction it edits (not a generic "Editar categoría" with no context
for assistive tech). The control MUST be disabled (not removed) while its
mutation is pending, and a success/failure status MUST be announced via
`aria-live`.

#### Scenario: Keyboard-only user can open and complete a reclassify

- GIVEN the user tabs to a row's reclassify control
- WHEN they activate it with Enter/Space and select a categoría via keyboard
- THEN the reclassify completes the same as a mouse interaction (confirming
  the cross-bucket dialog via keyboard when it appears)

### Requirement: WPER-01 — Viewed period is visible at the top of the dashboard, as an interactive trigger

The dashboard MUST display the currently viewed MES/AÑO prominently at the
top of the page, formatted in Spanish (e.g. "julio 2026"), using the existing
`mesCompletoLabel` helper. This MUST render identically for demo and
authenticated flows (shared route/component). The label MUST be rendered as
a real `<button>` (the popover trigger, WMYP-01), not static text.
(Previously: label was static text, no popover trigger.)

#### Scenario: Authenticated user sees the current period label at the top

- GIVEN an authenticated user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown prominently at the top of the dashboard, as a
  clickable button

#### Scenario: Demo user sees the same label in the same position

- GIVEN a demo user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown at the top, identical in position, format, and
  interactivity to the authenticated flow

### Requirement: WPER-02 — Prev navigation moves one month back

The prev control MUST move the viewed period back exactly one calendar
month, update the URL search param, and trigger a data refetch for the new
period. Prev MUST remain enabled for any past month (unbounded).

#### Scenario: Clicking prev from July 2026 goes to June 2026

- GIVEN the dashboard is viewing period `2026-07`
- WHEN the user activates the prev control
- THEN the URL period param becomes `2026-06`
- AND the dashboard refetches and displays "junio 2026"

### Requirement: WPER-03 — Next navigation is clamped at the current month

The next control MUST move the viewed period forward exactly one calendar
month, update the URL search param, and trigger a refetch, UNLESS the viewed
period is already the current month, in which case the next control MUST be
disabled and MUST NOT navigate to a future period.

#### Scenario: Next is enabled and works when viewing a past month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-06`
- WHEN the user activates the next control
- THEN the URL period param becomes `2026-07`
- AND the dashboard refetches and displays "julio 2026"

#### Scenario: Next is disabled when viewing the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-07`
- WHEN the dashboard renders
- THEN the next control is disabled
- AND activating it (click or keyboard) produces no navigation and no
  refetch

### Requirement: WPER-04 — "Hoy" jumps to the current month

The "Hoy" control MUST set the viewed period to the current calendar month
(via the existing `periodoActualUTC` helper), updating the URL search param
and triggering a refetch. When the viewed period is already the current
month, "Hoy" MUST be disabled (no-op).

#### Scenario: "Hoy" from a past month returns to the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-03`
- WHEN the user activates "Hoy"
- THEN the URL period param becomes `2026-07`
- AND the dashboard refetches and displays "julio 2026"

#### Scenario: "Hoy" is disabled when already viewing the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-07`
- WHEN the dashboard renders
- THEN the "Hoy" control is disabled

### Requirement: WPER-05 — Changing the period preserves the bucket-selection-reset behavior

Any period change performed through prev, next, or "Hoy" MUST route through
the existing `onPeriodoChange` callback path (URL param), so the
pre-existing bucket-selection-reset effect in `ResumenScreen` continues to
fire unchanged. No parallel state source may be introduced for period.

#### Scenario: Selecting a bucket then changing period clears the selection

- GIVEN a bucket (e.g. Deseos) is selected in the dashboard panel
- WHEN the user navigates to a different period via prev, next, or "Hoy"
- THEN the bucket selection is cleared, matching pre-existing behavior for
  period changes

### Requirement: WPER-06 — Period controls are accessible (WCAG 2.2 AA)

Prev, next, and "Hoy" MUST be real `<button>` elements, each with a distinct
Spanish `aria-label` (e.g. "Mes anterior", "Mes siguiente", "Ir al mes
actual"), operable via keyboard (Tab/Enter/Space), and MUST show a visible
focus ring. Disabled controls MUST expose their disabled state to assistive
technology (native `disabled` attribute).

#### Scenario: Keyboard-only user can navigate periods

- GIVEN a keyboard-only user tabs to the prev control
- WHEN they activate it with Enter or Space
- THEN the period changes exactly as a mouse click would, and focus remains
  visible on the control

#### Scenario: Disabled next control is announced as disabled

- GIVEN the dashboard is viewing the current month
- WHEN a screen reader reaches the next control
- THEN it is announced as disabled, not merely visually dimmed

### Requirement: WPER-07 — Period control styling uses Serene Finance tokens only

The period selector control MUST use only Serene Finance design tokens
(e.g. `--color-primary`, `--color-muted`, `--color-border`) for its colors,
borders, and focus states. It MUST NOT use raw Tailwind palette classes
(e.g. `slate-*`, `gray-*`) anywhere in its markup.

#### Scenario: No raw Tailwind palette classes remain on the control

- GIVEN the period selector component's rendered markup
- WHEN its class names are inspected
- THEN no raw Tailwind color-palette utility classes (e.g. `slate-*`) are
  present — only Serene Finance token-based classes/variables

### Requirement: WMYP-01 — Period label opens/closes an accessible popover

Clicking the period label trigger MUST open a popover containing the month
grid and year navigation. Pressing Escape, clicking outside the popover, or
clicking the trigger again MUST close it. On close, focus MUST return to the
trigger.

#### Scenario: Clicking the label opens the popover

- GIVEN the popover is closed
- WHEN the user clicks the period label
- THEN the popover opens showing the month grid and year navigation

#### Scenario: Escape closes the popover and returns focus

- GIVEN the popover is open
- WHEN the user presses Escape
- THEN the popover closes and focus returns to the period label trigger

#### Scenario: Outside click closes the popover

- GIVEN the popover is open
- WHEN the user clicks outside the popover
- THEN the popover closes

### Requirement: WMYP-02 — Month grid shows 12 Spanish-abbreviated months with the active one marked

The popover MUST render a 12-cell grid using `mesAbreviado` (Ene..Dic) for
the year currently displayed in the popover. The cell matching the
dashboard's currently-viewed (year, month) MUST be visually marked as
active/selected.

#### Scenario: Current period is marked active in the grid

- GIVEN the dashboard is viewing `2026-07` and the popover shows year 2026
- WHEN the popover opens
- THEN the "Jul" cell is visually marked as active and no other cell is

### Requirement: WMYP-03 — Selecting a month jumps the period and closes the popover

Selecting an enabled month cell MUST set the viewed period to that
`(year, month)` through the existing `onChange` contract (URL search param
update + refetch), and MUST close the popover.

#### Scenario: Selecting a past month in the same year jumps directly

- GIVEN the dashboard is viewing `2026-07` and the popover is open on year
  2026
- WHEN the user selects "Mar"
- THEN the URL period param becomes `2026-03`, the dashboard refetches and
  displays "marzo 2026", and the popover closes

#### Scenario: Selecting a month after navigating to a past year jumps across years

- GIVEN the popover is open and the user navigated to year 2024
- WHEN the user selects "Nov"
- THEN the URL period param becomes `2024-11` and the popover closes

### Requirement: WMYP-04 — Year navigation inside the popover is clamped at the current year

The popover MUST offer prev-year and next-year controls that change only the
grid's displayed year (not the dashboard's viewed period) until a month is
selected. The next-year control MUST be disabled when the displayed year
equals the current calendar year, and MUST NOT navigate beyond it.

#### Scenario: Prev-year moves the grid back one year

- GIVEN the popover is open showing year 2026
- WHEN the user activates prev-year
- THEN the grid shows year 2025 with `mesAbreviado` cells for 2025

#### Scenario: Next-year is disabled at the current year

- GIVEN the popover is open showing the current calendar year (2026)
- WHEN the popover renders
- THEN the next-year control is disabled, and activating it produces no
  change

### Requirement: WMYP-05 — Future months are disabled in the current year

When the grid displays the current calendar year, months after the current
month MUST be rendered disabled (not selectable, `disabled` semantics for
assistive tech). Grids for past years have no disabled months. This mirrors
the existing next-arrow clamp (WPER-03).

#### Scenario: Months after the current month are disabled

- GIVEN the current month is `2026-07` and the grid displays year 2026
- WHEN the grid renders
- THEN "Ago" through "Dic" are disabled and "Ene" through "Jul" are enabled

#### Scenario: Clicking a disabled future month does nothing

- GIVEN the grid displays year 2026 with "Ago" disabled
- WHEN the user clicks or activates "Ago" via keyboard
- THEN no period change occurs, no refetch happens, and the popover stays
  open

### Requirement: WMYP-06 — Existing arrow/"Hoy" navigation is unaffected

Adding the popover picker MUST NOT change the behavior, presence, or clamp
logic of the prev/next arrows or the "Hoy" control (WPER-02, WPER-03,
WPER-04). Both navigation modes MUST coexist and update the same URL period
state.

#### Scenario: Prev/next arrows and "Hoy" still work after the popover ships

- GIVEN the dashboard has the popover trigger available
- WHEN the user uses the prev arrow, the next arrow, or "Hoy" instead of the
  popover
- THEN the period changes exactly as specified in WPER-02/03/04, unaffected
  by the popover's existence

### Requirement: WMYP-07 — Popover and grid are keyboard-operable and accessible (WCAG 2.2 AA)

The trigger MUST expose a Spanish `aria-label`/accessible name. The popover
MUST use appropriate ARIA roles for a grid of selectable options, each month
cell MUST be reachable and operable via keyboard (Tab/Arrow keys, Enter/
Space), and disabled cells MUST expose native disabled semantics. Year
navigation controls MUST have distinct Spanish `aria-label`s (e.g. "Año
anterior", "Año siguiente").

#### Scenario: Keyboard-only user can open, navigate, and select

- GIVEN a keyboard-only user tabs to the period label trigger
- WHEN they activate it, navigate the grid via keyboard, and press Enter on
  an enabled month
- THEN the popover opens, the grid is keyboard-navigable, and selection
  behaves identically to a mouse click

### Requirement: WMYP-08 — Popover styling uses Serene Finance tokens only

The popover, month grid, and year navigation MUST use only Serene Finance
design tokens for colors, borders, and focus states. Raw Tailwind palette
classes (e.g. `slate-*`, `gray-*`) MUST NOT appear anywhere in this markup.

#### Scenario: No raw Tailwind palette classes on the popover

- GIVEN the popover's rendered markup
- WHEN its class names are inspected
- THEN no raw Tailwind color-palette utility classes are present — only
  Serene Finance token-based classes/variables

### Requirement: DCR-01 — Income card has a semantic income identity

`IngresoCard` MUST render with the pastel-green fill token `--color-ingreso`
(`#d1fae5`) as its background, a `TrendingUp` lucide icon, and the income
amount/label text styled with the `--color-ingreso-foreground` token (`#065f46`).

#### Scenario: Income card shows mint fill, green amount, and trend icon

- GIVEN the dashboard renders `IngresoCard` for a period with income
- WHEN the card mounts
- THEN it has the `bg-ingreso` fill class, a `TrendingUp` icon is present,
  and the amount/label use the `text-ingreso-foreground` class

### Requirement: DCR-02 — Income card has no decorative left border

`IngresoCard` MUST NOT render `border-l-4 border-l-slate-800` or any other
decorative left-border utility.

#### Scenario: No left-border classes on the income card

- GIVEN `IngresoCard`'s rendered markup
- WHEN its class names are inspected
- THEN neither `border-l-4` nor `border-l-slate-800` (nor any `border-l-*`)
  is present

### Requirement: DCR-03 — Income card uses design tokens only, no raw palette utilities

`IngresoCard` MUST consume Serene Finance design tokens for all color styling
and MUST NOT use raw Tailwind palette utilities (e.g. `slate-*`).

#### Scenario: No raw slate utilities remain on the income card

- GIVEN `IngresoCard`'s rendered markup
- WHEN its class names are inspected
- THEN no `slate-*` utility classes are present — only token-based classes

### Requirement: DCR-04 — Authenticated app shell uses the pale-blue background token

The `--background` token MUST be `#e8f0fa` in light mode, applied app-shell-wide
via the existing `bg-background` usage.

#### Scenario: App shell background is pale pastel blue

- GIVEN the authenticated web app renders in light mode
- WHEN the app shell's computed background is inspected
- THEN it resolves to `#e8f0fa`

### Requirement: DCR-05 — Primary token is `#2260b2` in light mode

The `--primary` token MUST be `#2260b2` in light mode. Components that
reference `--primary` (buttons, headings) MUST reflect this value without
component-level changes.

#### Scenario: Primary-styled elements pick up the new blue

- GIVEN a button or heading styled with the `primary` token in light mode
- WHEN its computed color/background is inspected
- THEN it resolves to `#2260b2`

### Requirement: DCR-06 — New color pairings meet WCAG 2.2 AA (ADR-018)

Every pairing introduced or changed by this spec MUST meet WCAG 2.2 AA
(≥4.5:1 for text): income text on income fill, primary on white, and primary
on the new background.

#### Scenario: Documented pairings meet AA contrast

- GIVEN the pairings `--color-ingreso-foreground` on `--color-ingreso`, `--primary`
  on white, and `--primary` on `--background`
- WHEN their contrast ratios are computed
- THEN they are 6.78:1, 6.21:1, and 5.40:1 respectively — all ≥4.5:1 AA

### Requirement: DCR-07 — Dark mode is unaffected

Only light-mode `:root` tokens change. The `.dark` theme MUST continue to
render without regression (no removed rules, no broken component).

#### Scenario: Dark mode renders unchanged

- GIVEN the app is switched to dark mode
- WHEN the dashboard renders
- THEN `.dark` token values are unchanged from before this change and the
  layout renders without errors

## Non-Goals

- Bulk reclassify UI (one transaction at a time, per `categorias-api`).
- Mobile (`apps/mobile`) per-transaction categoría UI.
- Editing/creating categorías or patterns from the web UI.
- The standalone `/buckets/:bucket` deep-link route's own layout beyond
  reusing the grouped-by-categoría rendering already required here.
