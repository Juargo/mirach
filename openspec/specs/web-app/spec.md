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

### Requirement: WPER-01 — Viewed period is visible at the top of the dashboard

The dashboard MUST display the currently viewed MES/AÑO prominently at the
top of the page, formatted in Spanish (e.g. "julio 2026"), using the existing
`mesCompletoLabel` helper. This MUST render identically for demo and
authenticated flows (shared route/component).

#### Scenario: Authenticated user sees the current period label at the top

- GIVEN an authenticated user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown prominently at the top of the dashboard

#### Scenario: Demo user sees the same label in the same position

- GIVEN a demo user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown at the top, identical in position and format to
  the authenticated flow

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

## Non-Goals

- Bulk reclassify UI (one transaction at a time, per `categorias-api`).
- Mobile (`apps/mobile`) per-transaction categoría UI.
- Editing/creating categorías or patterns from the web UI.
- The standalone `/buckets/:bucket` deep-link route's own layout beyond
  reusing the grouped-by-categoría rendering already required here.
