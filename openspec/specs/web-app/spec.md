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

## Non-Goals

- Bulk reclassify UI (one transaction at a time, per `categorias-api`).
- Mobile (`apps/mobile`) per-transaction categoría UI.
- Editing/creating categorías or patterns from the web UI.
- The standalone `/buckets/:bucket` deep-link route's own layout beyond
  reusing the grouped-by-categoría rendering already required here.
