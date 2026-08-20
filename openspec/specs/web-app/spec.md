# Web App UI Specification (apps/web)

## Purpose

Dashboard drill-down: clicking a bucket (or Sin categoría) in the 50/30/20
pie/legend navigates to that bucket's Detalle MES-BUCKET page (`/buckets/:bucket`),
which shows only that bucket's transactions for the viewed month, grouped by the
finer `categoria` exposed by `categorias-api`, with an active reclassify control
(replacing the earlier disabled "Editar categoría" / "Clasificar" placeholders,
and the US-047 interim inline panel, retired by US-053).

## Requirements

### Requirement: WCAT-01 — Clicking a bucket shows only that bucket's transactions

Clicking a pie slice or legend entry MUST navigate to that bucket's Detalle MES-BUCKET page
(`/buckets/{bucket}`, WDM-06), carrying the current `periodo` search param, so the page shows ONLY the
clicked bucket's transactions for the selected period — not all buckets at once. The dashboard MUST NOT
swap an inline panel.
(Previously: clicking swapped the dashboard's right inline panel (US-047 interim) to show the bucket's
transactions; the panel is retired by this change.)

#### Scenario: Clicking Deseos shows only Deseos transactions

- GIVEN the dashboard is viewing period `2026-07`
- WHEN the user clicks the Deseos pie slice
- THEN the URL becomes `/buckets/Deseos?periodo=2026-07` and the page shows only Deseos transactions, none
  from other buckets

### Requirement: WCAT-02 — The page's groups come from the backend, ordered without a hardcoded enum

The Detalle MES-BUCKET page MUST render the bucket's transactions grouped by `categoria`, with grouping and
ordering provided by the backend (`bucket-detalle-mes` MBD-02) — the client MUST NOT re-group or re-sort.
Each group header MUST show the categoría name, its transaction count, and its exact subtotal (from
string/BigInt amounts, never `Number()`/`parseFloat()`). Rows with no categoría render under a
"Sin categoría" group. Group order MUST be data-driven — alphabetical by categoría `nombre` — with the
"Sin categoría" group always rendered last, regardless of its count. The ordering MUST NOT read a static
`ORDEN_CATEGORIAS` enum (retired by this change, §7); a user-created or renamed categoría MUST sort
correctly with no ordering-code change.
(Previously: group order was implicit, driven by the hardcoded `ORDEN_CATEGORIAS.indexOf` enum in
`domain/categoria.ts`; that enum is retired by this change, §7.)
(Previously: this requirement governed the retired US-047 panel's client-side grouping of the flat US-017
endpoint; the page now renders the grouped endpoint verbatim (WDM-03), and the guarantees move to the
server contract MBD-02.)

#### Scenario: Necesidades page groups by its 5 categorías

- GIVEN Necesidades has transactions in Supermercado, Farmacia, and Transporte this period
- WHEN the page renders
- THEN exactly those 3 categoría groups appear, each with its own count and exact subtotal

#### Scenario: Subtotal precision survives large amounts

- GIVEN a group contains a transaction beyond `Number.MAX_SAFE_INTEGER`
- WHEN the group's subtotal is computed
- THEN every digit is preserved (BigInt/integer arithmetic, not float)

#### Scenario: A newly created categoría sorts alphabetically with no code change

- GIVEN a user creates categoría "Zapatería" in Deseos alongside existing "Delivery" and "Streaming"
- WHEN the Deseos page renders
- THEN groups appear alphabetically (`Delivery`, `Streaming`, `Zapatería`), with no ordering constant updated

#### Scenario: Sin categoría group always renders last

- GIVEN a bucket page whose payload has both categorized and uncategorized groups
- WHEN the page renders
- THEN the "Sin categoría" group appears after every named categoría group, per the server's order (MBD-02)

### Requirement: WCAT-03 — Empty states are explicit on the page and preserved on the dashboard

If the viewed bucket has zero transactions for the viewed period, the Detalle MES-BUCKET page MUST render
the explicit month empty state — header with zeroed totals plus the copy `Sin movimientos en {mes}`, with
month navigation preserved (WDM-05). The dashboard's existing period-empty state for a zero-transaction
period MUST remain unchanged.
(Previously: the empty state lived in the retired US-047 inline panel — "the panel shows the existing 'no
movements' empty state"; the page's explicit month empty state is new.)

#### Scenario: A bucket with zero transactions this period shows the explicit empty state

- GIVEN Ahorro has zero transactions for the viewed month
- WHEN the user opens `/buckets/Ahorro?periodo=<month>`
- THEN the header shows zeroed totals, `Sin movimientos en {mes}` renders, and month navigation remains
  available

### Requirement: WCAT-04 — Reclassify control is active, data-driven, and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder: activating it MUST let the user
choose a categoría (offered as ALL of the caller's own categorías, grouped by bucket, sourced from
`useCategorias()` — the live query this change introduces — never a hardcoded list) and call the
`categorias-api` reclassify endpoint. `ReclasificarCategoriaControl` MUST derive the destination bucket
from the chosen categoría's own `bucket` field in the DTO, not a static name→bucket map. When the chosen
categoría's bucket differs from the transaction's current bucket, the control MUST show a confirmation
naming the exact money move (e.g. "Esto mueve $X de Deseos a Necesidades") before committing; same-bucket
reclassification MUST commit immediately without a confirmation step. On success, the page's group list
AND the resumen (pie/traffic-light) MUST refresh to reflect the new categoría/bucket (the page's own query
refreshes via the new invalidation key, WDM-07). The SinCategoria "Clasificar" CTA MUST behave the same
way via the same control. A categoría created, renamed, or deleted through `/configuracion/categorias`
MUST be reflected here with no code change (`domain/categoria.ts`'s hardcoded exports are removed, §7).
(Previously: the dropdown and bucket-move logic were backed by `domain/categoria.ts`'s hardcoded
`ORDEN_CATEGORIAS`/`CATEGORIA_BUCKET`, which could offer a deleted categoría, omit a newly created one, or
misfire/skip the cross-bucket confirmation after a re-bucket, §7.)
(Previously: this requirement named "the panel's transaction list" as the refresh target; the control is
ported to the Detalle MES-BUCKET page unchanged — its render site is the page's group list.)

#### Scenario: A successful within-bucket reclassify updates the group counts

- GIVEN a transaction shown under "Delivery" in the Deseos page's group list
- WHEN the user reclassifies it to "Streaming" via the control
- THEN it commits immediately (no confirmation dialog), moves to the "Streaming" group, and both groups'
  counts/subtotals update, with no change to the Deseos pie slice

#### Scenario: A cross-bucket reclassify requires confirmation and then updates the resumen

- GIVEN a transaction shown under Deseos is being reclassified to a Necesidades categoría
- WHEN the user selects the target categoría
- THEN a confirmation naming the money move is shown before anything commits
- WHEN the user confirms
- THEN the transaction disappears from the Deseos page and the resumen/traffic-light reflects the updated
  bucket totals

#### Scenario: Cancelling a cross-bucket confirmation leaves the UI unchanged

- GIVEN the cross-bucket confirmation dialog is showing
- WHEN the user cancels (or presses Escape)
- THEN no request is sent and the transaction stays in its original group

#### Scenario: A failed reclassify leaves the UI unchanged

- GIVEN the reclassify endpoint returns an error (e.g. cross-tenant/invalid categoría)
- WHEN the user attempts the reclassify
- THEN the transaction stays in its original group and an error is communicated to the user

#### Scenario: A just-created categoría is offered by the dropdown immediately

- GIVEN a user creates categoría "Mascotas" via `/configuracion/categorias`
- WHEN they open a bucket's Detalle MES-BUCKET page and open the reclassify control on any transaction
- THEN "Mascotas" appears in the dropdown, grouped under its bucket, via the existing `['categorias']` cache
  — no code change

#### Scenario: A deleted categoría is no longer offered

- GIVEN a user deletes categoría "Delivery" via `/configuracion/categorias`
- WHEN they return to the Detalle MES-BUCKET page and open the reclassify control
- THEN "Delivery" no longer appears in the dropdown

#### Scenario: A re-bucketed categoría triggers the confirmation correctly

- GIVEN a user moves categoría "Supermercado" from Necesidades to Deseos via the edit screen
- WHEN they reclassify a Necesidades transaction to "Supermercado" on the Detalle MES-BUCKET page
- THEN the cross-bucket confirmation fires (Necesidades→Deseos), because the dropdown derives the bucket
  from the live DTO, not a stale map

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

### Requirement: WDM-01 — Detalle MES-BUCKET page structure: breadcrumb, month selector, %/meta tag, usage bar, totals line (CA-01)

For a bucket with data, `/buckets/:bucket` MUST render: a breadcrumb `Dashboard / {bucket}` (back control
below `md`, per WCTM-04's fixed-destination rule); the reused `PeriodoSelector` (WPER-01..07/WMYP-01..08
semantics); a %/meta tag rendering `porcentajeBp`/`metaBp` ONLY through `aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`
(MBD-01, ADR-024); a usage bar whose markers are presentation-only positions of the wire's `porcentajeBp` and
`metaBp` (no `bandas`, no extra fetch — `ZonaBar` not reused); and a totals line (bucket total via
`formatearMontoCLP` + transaction count). The route's `validateSearch` MUST accept `periodo` and `destacar`.

#### Scenario: Header renders all CA-01 elements for a real bucket (jsdom)

- GIVEN `/buckets/Necesidades?periodo=2026-07` with `metaBp: 5000` and `porcentajeBp: 5500`
- WHEN the page renders
- THEN breadcrumb, `PeriodoSelector`, %/meta tag, usage bar, and totals line are all present

#### Scenario: T1 tablet header geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the page renders
- THEN the header matches the wireframe T1 variant, asserted by rendered geometry — never by className
  presence alone (the `WCTG-14`/`WG5-10` gap)

### Requirement: WDM-02 — In-page month navigation and deep-linkable `periodo` (CA-02)

The page's `PeriodoSelector` MUST change the viewed month in-page (prev/next/"Hoy" per WPER-02/03/04),
updating the URL `periodo` search param with no reload and no parallel state source (WPER-05). Arriving with
`?periodo=YYYY-MM` MUST render that month's data; absent `periodo` resolves to the current month (MBD-04).
Navigation MUST remain available on an empty month (WDM-05).

#### Scenario: Arrows change the month in-page and update the URL (jsdom)

- GIVEN `/buckets/Deseos?periodo=2026-07` renders
- WHEN the user activates prev
- THEN the URL `periodo` becomes `2026-06` and the page refetches and renders June data

#### Scenario: A deep link honours `periodo`; absent `periodo` defaults to the current month (jsdom)

- GIVEN a deep link `/buckets/Ahorro?periodo=2026-03`
- WHEN the page loads
- THEN it renders March 2026 data
- AND `/buckets/Ahorro` with no `periodo` renders the current calendar month (MBD-04)

### Requirement: WDM-03 — Category groups render the server's order with expand/collapse and "ver N más…" (CA-03)

Each group MUST render the server's `nombre`, `conteo`, and exact `subtotal` (BigInt-safe string, never
`Number()`/`parseFloat()`), in the server's exact order — es-CL alphabetical, "Sin categoría" last (MBD-02).
The client MUST NOT re-group, re-sort, or truncate the payload. Each group MUST show at most 3 transaction
rows by default; a group with more MUST render a "ver N más…" control (N = remaining rows) that expands to
reveal all rows and collapses back. The control MUST be a real button with `aria-expanded` (hand-rolled,
KISS — no new dependency).

#### Scenario: Default 3 rows, then "ver N más…" expands and collapses (jsdom)

- GIVEN a group with 5 transactions
- WHEN the page renders
- THEN 3 rows are visible and a "ver 2 más…" control renders
- WHEN the control is activated
- THEN all 5 rows show and the control toggles to collapse

#### Scenario: Rendered group order matches the payload verbatim (jsdom)

- GIVEN a payload whose groups arrive ordered Ñoquis, Zapatería, "Sin categoría"
- WHEN the page renders
- THEN the rendered order is identical — no client-side re-sort

### Requirement: WDM-04 — Sin categoría group highlight via `?destacar=` and structural no-%/meta (CA-04, decision 2, MBD-03)

WHEN the page is reached with the `destacar` search param, the Sin categoría group MUST render visually
highlighted. The %/meta TAG MUST NOT render only for the SinCategoria bucket (`metaBp` null); the usage
BAR MUST NOT render whenever `porcentajeBp` is null — a no-income month (`porcentajeBp: null`, `metaBp`
non-null) keeps the tag rendered as `SIN_PORCENTAJE_LABEL` (MBD-03, WDM-01).

#### Scenario: Arrival with `destacar` highlights the Sin categoría group (jsdom)

- GIVEN navigation from the dashboard's Sin categoría chart item carrying a `destacar` search param
- WHEN the page renders
- THEN the Sin categoría group carries the highlight; a plain arrival (no `destacar`) renders no highlight

#### Scenario: SinCategoria bucket renders no %/meta and no usage bar (jsdom)

- GIVEN `/buckets/SinCategoria` with null `metaBp`/`porcentajeBp`
- WHEN the page renders
- THEN no %/meta tag and no usage bar render

### Requirement: WDM-05 — Explicit empty-month state (decision 4)

WHEN the viewed bucket has zero transactions for the viewed month (MBD-01: 200, zeroed totals, empty
`grupos`), the page MUST render the explicit empty state — the header with zeroed totals PLUS the copy
`Sin movimientos en {mes}` — with `PeriodoSelector` navigation preserved. A broken/empty group list MUST
NOT render.

#### Scenario: An empty bucket month renders zeros, the copy, and live navigation (jsdom)

- GIVEN Ahorro has zero transactions in `2026-07`
- WHEN `/buckets/Ahorro?periodo=2026-07` renders
- THEN the header shows 0 total and 0 transactions, `Sin movimientos en julio 2026` renders, no groups
  render, and the month arrows remain operable

### Requirement: WDM-06 — Dashboard wiring: pie/legend navigate; US-047 interim panel retired (CA-05)

Clicking a spend-bucket or Sin categoría pie wedge or legend row MUST navigate to `/buckets/{bucket}`
carrying the current `periodo` search param — never swap an inline panel (WCAT-01). The Sin categoría item
MUST additionally carry `destacar` (WDM-04). The US-047 interim panel MUST be retired: `ResumenScreen` MUST
have no bucket-selection state and no inline detail panel.

#### Scenario: A spend-bucket row navigates without `destacar` (jsdom)

- GIVEN the dashboard is viewing `2026-07`
- WHEN the user clicks the Deseos legend row
- THEN the URL becomes `/buckets/Deseos?periodo=2026-07` (no `destacar`) and no panel swaps

#### Scenario: The Sin categoría row navigates carrying `destacar` (jsdom)

- GIVEN the dashboard is viewing `2026-07`
- WHEN the user clicks the Sin categoría row
- THEN the URL becomes `/buckets/SinCategoria?periodo=2026-07&destacar=…` and the group highlights on arrival

### Requirement: WDM-07 — Reclassify is ported per row with a new invalidation key (decision 1)

The page MUST port `ReclasificarCategoriaControl` per transaction row with the WCAT-04/05 behavior
unchanged (live catalog, cross-bucket confirmation, a11y). `useReclasificarCategoria` MUST invalidate
`['detalle-bucket-mes', bucket, clave]` on success, REPLACING the retired `['detalle-bucket', bucket, clave]`
(design D-05/D-08: the flat chain is deleted, so the old key would match zero queries) — the set becomes
`['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']` (net: 3 keys, no dead
invalidation) — so a successful reclassify on the page refreshes the page's own query.

#### Scenario: A successful reclassify invalidates the page's key (jsdom)

- GIVEN a transaction row on `/buckets/Deseos`
- WHEN a reclassify mutation succeeds
- THEN `['detalle-bucket-mes', 'Deseos', clave]` is invalidated and the page's groups re-render with fresh
  data; the pre-existing resumen keys invalidate as before

### Requirement: WDM-08 — ADR-024: no client % arithmetic beyond `aPorcentajeLabel`; markers are presentation-only (decision 5)

The page MUST NOT perform any percentage computation beyond `aPorcentajeLabel` (bp → display label). Usage-bar
marker positions MUST be presentation-only positions derived from the wire's `porcentajeBp`/`metaBp` — no
ratio recomputation, no threshold logic, no client-side business-rule duplication (the WG5-11 boundary,
extended to this page).

#### Scenario: The only bp derivation is `aPorcentajeLabel` (jsdom)

- GIVEN the page's source
- WHEN it is inspected
- THEN the only bp→label derivation is `aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`, and marker positions are
  computed directly from the wire values as presentation

### Requirement: WCTG-01 — Route hierarchy: shared layout, third-level breadcrumb (CA-02, decision 4, §1)

`configuracion.tsx` MUST become a layout route rendering the shared `Configuración` h1 and section-tab
chrome through `<Outlet/>`. Perfil's content MUST move to a `configuracion.index` leaf. `/configuracion/
categorias` (CA-01 list) MUST be a sibling leaf sharing the same layout chrome, with its `Categorías` tab
carrying `aria-current="page"` and a working `<Link>` (no longer inert). `/configuracion/categorias/
:categoriaId` (CA-02 edit) MUST NOT inherit the tab shell — it renders the frame-3 breadcrumb
(`Configuración` / `Categorías` / `{nombre}`) instead.

#### Scenario: The Categorías tab is a real, active link

- GIVEN an authenticated session on `/configuracion`
- WHEN the user activates the `Categorías` tab
- THEN the URL becomes `/configuracion/categorias` and that tab carries `aria-current="page"`

#### Scenario: The edit route replaces tabs with a breadcrumb

- GIVEN the user opens `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN no tab list is rendered; the breadcrumb `Configuración / Categorías / {nombre}` renders instead

### Requirement: WCTG-02 — CA-01 list is grouped by bucket with row actions and creation (CA-01, §3, §8)

`/configuracion/categorias` MUST list the caller's own categories grouped by bucket in the fixed order
`Necesidades`, `Deseos`, `Ahorro` — the `Deseos` group heading MUST render the display label `Gustos`
(reusing `ETIQUETA_BUCKET`, per A1), while the value sent to/read from the API stays the wire value
`Deseos`. Each row MUST show the categoría name, its pattern tag (WCTG-03), and edit + delete row
actions. A page-level `Nueva categoría` button MUST sit beside the title (`Nueva` at tablet width per
§8). An empty catalog MUST render a specified empty state.

#### Scenario: Groups render in fixed bucket order with the display label

- GIVEN a catalog with categories in all three assignable buckets
- WHEN the list renders
- THEN groups appear in order `Necesidades`, `Gustos`, `Ahorro` — the middle heading reads `Gustos`, not
  `Deseos`

#### Scenario: A deleted-all-categories user sees the empty state

- GIVEN a user with zero categories
- WHEN `/configuracion/categorias` renders
- THEN a specified empty state renders, not a broken/blank list

### Requirement: WCTG-03 — Pattern-count tag has three grammatical forms (§3, wireframes §5)

The pattern-count tag (list row and any other place it appears) MUST render `sin patrones` for 0,
`1 patrón` for exactly 1, and `N patrones` for 2 or more. A naive `${n} patrón${n === 1 ? '' : 'es'}`
MUST NOT be used, since it renders `0 patrones` instead of `sin patrones`.

#### Scenario: Zero patterns render the zero form

- GIVEN a category with zero patterns
- WHEN its tag renders
- THEN it reads exactly `sin patrones`

#### Scenario: Exactly one pattern renders the singular form

- GIVEN a category with exactly 1 pattern
- WHEN its tag renders
- THEN it reads exactly `1 patrón`

#### Scenario: Two or more patterns render the plural form

- GIVEN a category with 3 patterns
- WHEN its tag renders
- THEN it reads exactly `3 patrones`

### Requirement: WCTG-04 — Edit screen has two independent commit semantics (CA-02, decision 2, §4)

The edit screen MUST have two independent mutation surfaces. Identity (`Nombre`, required `Bucket`)
commits ONLY on `Guardar`, via one `PATCH /api/categorias/:id`. Patterns commit immediately, per row,
via independent `POST`/`PATCH`/`DELETE /api/patrones` calls the moment each row action is confirmed —
never batched with `Guardar`. `Cancelar` MUST discard ONLY the identity draft (`Nombre`/`Bucket`) and
return to the list; it MUST NOT revert, hide, or otherwise imply it undid any pattern row already
committed during the same visit.

#### Scenario: A pattern edit survives Cancelar

- GIVEN the user adds a pattern (which commits immediately) and then edits `Nombre` without saving
- WHEN the user activates `Cancelar`
- THEN the identity edit is discarded, the user returns to the list, and the newly added pattern is
  present when the category is reopened

#### Scenario: Guardar sends exactly one PATCH for identity, never touching patterns

- GIVEN `Nombre` is dirty and no pattern was touched this visit
- WHEN the user activates `Guardar`
- THEN exactly one `PATCH /api/categorias/:id` is sent and no pattern endpoint is called

### Requirement: WCTG-05 — Footer is one row; copy and divider carry the two-commit honesty (decision 10, §4)

The edit screen's footer MUST be a single row below the divider that closes the patterns section: the
red `Eliminar categoría` left-aligned, `Cancelar` and `Guardar` right-aligned in the same row. Because
this places the destructive delete control alongside the identity-commit buttons despite WCTG-04's two
different commit semantics, the screen MUST carry that honesty through two things instead of footer
separation: (a) the divider that visually closes the patterns section immediately above the footer, and
(b) copy that never implies a pattern edit is pending, undoable by `Cancelar`, or bundled with `Guardar`.

#### Scenario: Delete sits in the same row as Cancelar/Guardar

- GIVEN the edit screen renders
- WHEN the footer is inspected
- THEN `Eliminar categoría`, `Cancelar`, and `Guardar` are all in one row below the section divider

#### Scenario: No copy implies Cancelar undoes a pattern edit

- GIVEN a pattern was added earlier in the visit
- WHEN the user opens `Cancelar` or reads any footer-adjacent copy
- THEN nothing states or implies that activating `Cancelar` will discard or has discarded that pattern

### Requirement: WCTG-06 — The "sin patrones" note is always rendered, not a zero-state (CA-03, decision 9, §3/§4)

The edit screen MUST render the static note `Sin patrones, la categoría solo se puede asignar
manualmente.` below the patterns section, preceded by an info icon, in the same position REGARDLESS of
how many patterns the category has (0, 1, or many) — it is helper text, not a conditional zero-state.
The list's `sin patrones` tag (WCTG-03) carries the same CA-03 meaning for the list surface.

#### Scenario: The note renders under a category with zero patterns

- GIVEN a category with zero patterns
- WHEN the edit screen renders
- THEN the note renders verbatim below the (empty) patterns section

#### Scenario: The note also renders under a category with several patterns

- GIVEN a category with 3 patterns
- WHEN the edit screen renders
- THEN the identical note still renders below the populated patterns list

### Requirement: WCTG-07 — Bucket change requires an all-periods impact confirmation before saving (decision 1, §5)

WHEN `Bucket` is dirty relative to the loaded value, `Guardar` MUST NOT send `PATCH /api/categorias/:id`
until the user confirms an impact dialog. The dialog's copy MUST state both the `transaccionesCount`
transactions affected AND that the change re-stamps classification for **all periods**, not only the
current month — this is the single most dangerous operation in the change, since it retroactively
rewrites the 50/30/20 split of every closed month. The dialog MUST use `role="alertdialog"`, move focus
to the confirm button on open, close on `Escape` and restore focus to the trigger without sending a
request, and keep the dialog open with an inline error on failure (no silent close).

#### Scenario: A dirty Bucket cannot save without confirming

- GIVEN `Bucket` was changed from `Necesidades` to `Deseos` and is dirty
- WHEN the user activates `Guardar`
- THEN no `PATCH` is sent; a confirmation dialog opens naming the affected count and stating the change
  applies to all periods, not just the current month

#### Scenario: Escape cancels and preserves the dirty draft

- GIVEN the bucket-change confirmation dialog is open
- WHEN the user presses `Escape`
- THEN no request is sent, focus returns to `Guardar`, and `Bucket` remains dirty on screen

### Requirement: WCTG-08 — Delete impact confirmation, and no 409 exists or is ever expected (CA-04, decisions 3/5, §5)

`Eliminar categoría` (from a list row action or the edit screen) MUST open a confirmation dialog whose
impact sentence is sourced from the `transaccionesCount` already present in the caller's `['categorias']`
list data (never a fresh fetch) — e.g. "N transacciones pasan a Sin categoría." The `transaccionesCount
=== 0` case MUST be softened or skipped, mirroring `EliminarIngestaControl`'s zero-movement treatment.
Confirming MUST call `DELETE /api/categorias/:id`, which per decision 5 ALWAYS returns `204` for the
caller's own row — in use or not. The client-side implementation MUST NOT contain any code path, UI
state, or copy that handles a `409` for this endpoint: no such response exists and none will, so nothing
should be built to catch it.

#### Scenario: Confirming delete succeeds unconditionally and returns to the list

- GIVEN the delete confirmation dialog is open for a category with `transaccionesCount: 12`
- WHEN the user confirms
- THEN `DELETE /api/categorias/:id` is called, the response is treated as always successful (`204`), and
  the user is navigated back to the list

#### Scenario: Zero impact is softened

- GIVEN a category with `transaccionesCount: 0`
- WHEN the delete confirmation dialog opens
- THEN the "N transactions" sentence is not shown in its full alarming form (softened or omitted), per
  the `EliminarIngestaControl` precedent

#### Scenario: No 409 handling exists to find

- GIVEN the delete mutation's error-handling code
- WHEN it is inspected
- THEN it contains no branch, state, or copy keyed to a `409` response for `DELETE /api/categorias/:id`

### Requirement: WCTG-09 — Invalidation matrix is asymmetric by mutation kind, with the exclusion enforced (CA-05, §6)

Two profiles apply. **Profile A** (all three pattern mutations: create/update/delete a pattern) MUST
invalidate ONLY `['categorias']`. **Profile B** (all three category mutations: create/rename/re-bucket/
delete a category) MUST invalidate `['categorias']` PLUS the three broad dashboard prefix keys
`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']` (no period/bucket segment appended). A pattern
mutation MUST NOT invalidate any of the three dashboard keys — the exclusion now names the renamed
`['detalle-bucket-mes']` key — this exclusion is deliberate (pattern CRUD has zero effect on any persisted
transaction) and MUST be its own asserted, testable behavior, not an implied absence. After a successful
delete from the edit screen, the user MUST be navigated back to the list.
(Previously: the bucket-drill-down key was named `['detalle-bucket']` literally; US-053 retires the flat
`detalle-bucket` web chain (design D-08) and the matrix must refresh the new month-scoped page instead, so
the key is renamed `['detalle-bucket-mes']` — the same rename `invalidarCatalogoYDashboard` lands in PR3.)

#### Scenario: A pattern mutation invalidates only the catalog

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['categorias']` is invalidated

#### Scenario: A pattern mutation does NOT invalidate the dashboard (the exclusion, renamed key)

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['resumen']`, `['resumen-anual']`, and `['detalle-bucket-mes']` are NOT invalidated — asserted
  explicitly, not inferred from their absence in a different test

#### Scenario: A category mutation invalidates the catalog and all three dashboard keys (renamed)

- GIVEN a category is created, renamed, re-bucketed, or deleted
- WHEN the mutation resolves
- THEN `['categorias']`, `['resumen']`, `['resumen-anual']`, and `['detalle-bucket-mes']` are all
  invalidated

### Requirement: WCTG-10 — `:categoriaId` absent from the list is a reachable, specified not-found state (§1)

Because `GET /api/categorias/:id` does not exist, the edit route MUST resolve its category by `id` out of
the already-loaded `['categorias']` list query — one query serves both screens. WHEN the id is not present
in that list (stale link, or the category was deleted in another tab), a specified not-found state MUST
render (never a blank screen or an unhandled crash), offering navigation back to the list.

#### Scenario: A stale or deleted id renders a not-found state

- GIVEN `/configuracion/categorias/:categoriaId` is opened with an id absent from the caller's own
  `['categorias']` list
- WHEN the route resolves
- THEN a specified not-found state renders, with a way back to the list — not a blank page or a crash

### Requirement: WCTG-11 — Demo sessions see a proactively disabled, read-only catalog (§9)

Every mutation control on both screens (create, `Guardar`, every pattern row action, and both
confirmation dialogs' confirm button) MUST be PROACTIVELY disabled for a demo session (`esDemo`), with a
`role="note"` explanation of why. In addition, a defensive `403 DEMO_SOLO_LECTURA` mapping MUST exist for
every mutation endpoint, using a NEW dedicated `MENSAJE_DEMO_CATALOGO` constant — NOT the existing
`MENSAJE_DEMO_SOLO_LECTURA` copy reused verbatim — in case a disabled control is somehow bypassed. The
read path (list and edit-by-id-from-list) MUST still render normally for a demo session — a demo user sees
their own catalog, read-only. (Reconciled 2026-08-14 with design.md's accepted CORRECTION Q6c — the spec
predated it because spec and design ran in parallel. `MENSAJE_DEMO_SOLO_LECTURA` reads "…para editar tu
perfil.", which is false on the categories screen, hence the new sibling constant.)

#### Scenario: A demo user sees disabled controls with an explanation

- GIVEN a demo session
- WHEN `/configuracion/categorias` or its edit screen renders
- THEN every mutation control is disabled and a `role="note"` element explains why

#### Scenario: A demo user's catalog still reads normally

- GIVEN a demo session
- WHEN the demo user opens the list and an edit screen
- THEN their own catalog and its patterns render exactly as a non-demo user's would, read-only

#### Scenario: A defensive 403 is still mapped even though controls are disabled

- GIVEN a mutation endpoint somehow receives a request from a demo session
- WHEN the response is `403 DEMO_SOLO_LECTURA`
- THEN the verbatim `MENSAJE_DEMO_CATALOGO` copy is shown — a category-specific sentence, distinct from
  (and never falling back to) the existing Perfil surface's `MENSAJE_DEMO_SOLO_LECTURA`

### Requirement: WCTG-12 — Error and success copy is a closed table over 11 codes plus BODY_INVALIDO (§8)

Error copy MUST be a closed table covering exactly the 11 codes the deployed catalog API returns
(`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`,
`PRIORIDAD_INVALIDA`, `DEMO_SOLO_LECTURA`, `CATEGORIA_NO_ENCONTRADA`, `PATRON_NO_ENCONTRADO`,
`NOMBRE_DUPLICADO`, `PATRON_DUPLICADO`), plus one `BODY_INVALIDO` row for a malformed response body
(mirroring the `tag: 'parse'` `ApiError` case) — 12 codes total. The mapping's selection key MUST be
`code` ALONE, never `(status, code)` and never a server-supplied message string, and totality MUST be
enforced with a `Record<CodigoCatalogo, string>` over the closed 12-member code union — NOT a `switch` +
`never` on the code axis — so that adding a code without a row fails `tsc` directly. (Reconciled 2026-08-14
with design.md's accepted CORRECTION Q8b — the spec predated it because spec and design ran in parallel.
Design's Q8a confirms no code repeats across statuses, which is what makes keying by `code` alone safe: a
composite `(status, code)` key would carry a discriminator that discriminates nothing here.) (Corrected
2026-08-14 — round 2 of judgment-day on PR #334: this row is NOT client-only. The backend emits it
literally — `res.status(400).json({ code: 'BODY_INVALIDO', ... })` in
`apps/api/src/infrastructure/http-express/routes/categorias.routes.ts` and
`apps/api/src/infrastructure/http-express/routes/patrones.routes.ts` — whenever `.safeParse()` rejects a
mutation body, and `errorConCodigo` lifts any body `code` verbatim into `{ tag: 'server', status, code }`
client-side. It is ALSO produced client-side by a `tag: 'parse'` runtime-validation failure, as already
documented below. Both producers are real and both are covered by tests.)

Separately, on a DIFFERENT axis, the function that dispatches on the raw `ApiError` union's `tag` (5
members: `network`, `unauthorized`, `parse`, `invalid`, `server`) MUST itself be a closed `switch` +
`never` exhaustiveness guard, so a sixth `ApiError` tag is a compile error, not a silent fallthrough. Both
guards are required and neither replaces the other. In particular, `tag: 'parse'` — the shape produced when
a 2xx response body fails runtime DTO validation — MUST map to the `BODY_INVALIDO` row of the code table
above; before this reconciliation, that mapping was unspecified and shipped unimplemented (the `tag`
dispatch fell through to a generic fallback instead), which is the gap this reconciliation closes.

#### Scenario: Every one of the 11 codes maps to fixed client copy

- GIVEN each of the 11 documented `status:code` responses in turn
- WHEN it is mapped to UI copy
- THEN a fixed, closed-table string renders — never the server's own `message` field

#### Scenario: A malformed response body maps to the `BODY_INVALIDO` row

- GIVEN a response that fails runtime DTO validation (not a documented error code)
- WHEN it is mapped
- THEN the `BODY_INVALIDO` row's copy renders

#### Scenario: `ApiError` tag `parse` maps to `BODY_INVALIDO`, not the generic fallback

- GIVEN an `ApiError` with `tag: 'parse'` (the shape the fetch layer actually produces when a 2xx body
  fails its runtime DTO guard — this shape carries no `code` field at all)
- WHEN the `ApiError`-dispatch `switch` maps it to UI copy
- THEN the `BODY_INVALIDO` row's copy renders — never the generic fallback string

#### Scenario: An unmapped code fails to compile

- GIVEN a hypothetical new `CodigoCatalogo` member added to the closed union without a corresponding row
  in the `Record<CodigoCatalogo, string>` table
- WHEN the mapping table is type-checked
- THEN `tsc` fails to compile — never a silent runtime fallback

### Requirement: WCTM-01 — A new `md` (768px) breakpoint tier is scoped to the Configuración surfaces (D-1)

The Configuración surfaces this change touches (`ConfiguracionLayout`, `ConfiguracionTabs`,
`CategoriasPanel`'s `Nueva categoría` control, `CategoriaFila`, `EditarCategoria`, `PatronesSection`) MUST
distinguish three viewport tiers using Tailwind 4's stock `md` breakpoint (768px, no `--breakpoint-*`
override required) as the mobile/tablet boundary: **mobile <768px · tablet 768–1023px · desktop ≥1024px**.
This is expressed as literal `md:`-prefixed utility classes scoped to the files above, exactly as `lg:` is
used today — it MUST NOT introduce a constant into `apps/web/src/components/app-shell/layout.ts`, and it
MUST NOT change `AppShell`, `Sidebar`, or `BottomTabs`, whose Sidebar↔BottomTabs switch stays governed by
`lg` (1024px), unchanged, exactly as shipped (D-1: different concern, no evidence it needs to move).

#### Scenario: AppShell's Sidebar/BottomTabs switch is untouched (jsdom)

- GIVEN any viewport width
- WHEN `AppShell` renders
- THEN the Sidebar↔BottomTabs switch activates at exactly `lg` (1024px), unchanged by this change — no new
  breakpoint constant appears in `layout.ts`

#### Scenario: The three tiers are distinguishable within Configuración (Playwright)

- GIVEN viewport widths 360px, 880px, and 1280px (D-3's three verification widths)
- WHEN any Configuración surface renders
- THEN 360px renders the mobile variant, 880px renders the tablet variant, and 1280px renders the desktop
  variant — asserted by real rendered geometry, never by className-literal presence alone (a class existing
  in markup does not prove it is in effect at a given width — the exact gap that shipped `WCTG-14` false)

### Requirement: WCTM-02 — CA-01: mobile list chrome — horizontal tabs and a full-width Nueva categoría (CA-01, frame M2)

Below `md` (768px), `ConfiguracionTabs`' `Perfil`/`Categorías` tab list MUST render horizontally, spanning
the full available width — not the vertical column used at tablet/desktop widths (WCFG-11). Below `md`,
the `Nueva categoría` button on `/configuracion/categorias` MUST render as a full-width button positioned
below the tab list, not beside the section title as at tablet/desktop widths (WCTG-02).

#### Scenario: Tabs render horizontal and full-width below `md` (Playwright)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN `/configuracion` or `/configuracion/categorias` renders
- THEN the `Perfil`/`Categorías` tab list renders as a single horizontal row spanning the full content
  width — not the vertical column tablet/desktop widths render

#### Scenario: Nueva categoría renders full-width below the tabs (Playwright)

- GIVEN the viewport is below `md` (768px)
- WHEN `/configuracion/categorias` renders
- THEN the `Nueva categoría` button spans the full content width and sits below the tab list — not beside
  the section title

### Requirement: WCTM-03 — CA-02: mobile list row shows exactly one action control, with delete only via edit (CA-02, D-4, frame M2)

Below `md` (768px), each `CategoriaFila` list row MUST render exactly one action control — the edit link —
and MUST NOT render a separate delete control; the two-icon row WCTG-02 ships at tablet/desktop widths does
not carry over. `/configuracion/categorias` MUST render the footer sentence `Toca una categoría para
editarla o eliminarla.` below `md`, replacing whatever sentence renders at tablet/desktop widths. On a
mobile viewport, deleting a category MUST be reachable ONLY via the edit screen's `Eliminar categoría`
control (WCTG-08) — no swipe or long-press affordance exists (D-4); this is the single guarantee CA-02
protects, and it MUST be assertable regardless of which mechanism the single-icon requirement below is
implemented with.

#### Scenario: Exactly one action control renders per row below `md` (jsdom if conditional / Playwright if CSS-only)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN a category row renders
- THEN the row exposes the edit action and no delete action to the accessibility tree — not merely a
  visually-hidden delete button, since a CSS-hidden control can remain reachable by assistive tech; if the
  implementation renders the delete control conditionally (no delete `<button>` in the DOM below `md`) this
  is jsdom-assertable directly, if it hides the control with a `md:hidden`-style class this requires the
  Playwright real-viewport path plus an explicit accessibility-tree check

#### Scenario: The mobile footer sentence explains the single delete path (jsdom)

- GIVEN the viewport is below `md`
- WHEN `/configuracion/categorias` renders
- THEN the footer sentence `Toca una categoría para editarla o eliminarla.` is present, verbatim

### Requirement: WCTM-04 — CA-03: mobile header uses a back control and a section title on both the list and edit screens (CA-03, frames M2/M3)

Below `md` (768px), the Configuración header MUST replace the shared `Configuración` `<h1>` (WCFG-11) with
a back-icon control plus the screen's own section title, on BOTH `/configuracion` and
`/configuracion/categorias` (the shared-chrome list/Perfil screens, WCFG-11) AND
`/configuracion/categorias/:categoriaId` (the edit screen, where it also replaces the 3-level breadcrumb,
WCTG-01). CA-03 is not scoped to the edit screen alone. The section title reuses the screen's own existing
title text — no new copy is introduced for the title itself: the list/Perfil screens reuse their own
existing section label (`Perfil`/`Categorías`), the edit screen reuses the breadcrumb leaf it replaces (the
categoría's `nombre`).

The back control MUST navigate to a fixed, named destination route — never `history.back()` /
`router.back()`, so its behavior is identical on a cold deep-link with no history entry:

- From `/configuracion/categorias/:categoriaId`, back navigates to `/configuracion/categorias`.
- From `/configuracion/categorias` or `/configuracion`, back navigates to the dashboard (`/`).

(This mapping is this spec's resolution of the proposal's open question 3 — the wireframes draw the icon
but not its destination. It is grounded in the existing route hierarchy WCTG-01 already establishes: one
level up for the edit screen, mirroring the breadcrumb segment it replaces; out of the section entirely for
its two top-level screens, since CA-01 keeps the `Perfil`/`Categorías` tab switcher available immediately
below the header for moving between them, which would make a same-level "back" redundant there. If design
or a later reconciliation against issue #332's discussion finds different evidence, this mapping MUST be
revised explicitly, not silently overridden.)

The back control MUST satisfy WCAG 2.2 AA SC 2.5.8: a touch target of at least 24×24 CSS px, matching the
minimum WCTG-13 already requires of every other Configuración control, and MUST carry a non-empty,
descriptive accessible name (in Spanish, consistent with the rest of the interface's copy) identifying it
as a return control, reachable via its accessible name — not only visually distinguishable as an icon.

`/configuracion` (M1, Perfil) inherits this header change automatically, since it is the same shared
`ConfiguracionLayout` chrome as `/configuracion/categorias` — no Perfil-specific code is required (D-5);
this MUST be asserted as its own scenario rather than assumed.

#### Scenario: The shared h1 is absent below `md` on both list/Perfil and edit screens (jsdom)

- GIVEN the viewport is below `md` (768px)
- WHEN `/configuracion`, `/configuracion/categorias`, or `/configuracion/categorias/:categoriaId` renders
- THEN no `Configuración` `<h1>` renders; a back-icon control plus the screen's own section title renders
  instead

#### Scenario: The edit screen's breadcrumb is absent below `md` (jsdom)

- GIVEN the viewport is below `md`
- WHEN `/configuracion/categorias/:categoriaId` renders
- THEN the 3-level breadcrumb (`Configuración / Categorías / {nombre}`) does not render; the back control
  and the categoría's `nombre` render instead

#### Scenario: Back from the edit screen goes to the list, regardless of history (jsdom)

- GIVEN the edit screen was reached via a cold deep-link with no prior history entry
- WHEN the user activates the back control
- THEN the URL becomes `/configuracion/categorias` — a real navigation to a named route, not a
  history-dependent action

#### Scenario: Back from the list or Perfil screen exits to the dashboard, regardless of history (jsdom)

- GIVEN `/configuracion/categorias` (or `/configuracion`) was reached via a cold deep-link with no prior
  history entry
- WHEN the user activates the back control
- THEN the URL becomes `/` — a real navigation to a named route, not a history-dependent action

#### Scenario: The back control meets the a11y minimum (jsdom)

- GIVEN the back control renders on any of the three screens
- WHEN it is queried by its accessible name and measured
- THEN it resolves to exactly one control with a non-empty accessible name and a touch target of at least
  24×24 CSS px

#### Scenario: M1 (Perfil, mobile) inherits the header change with no Perfil-specific code (Playwright, D-5)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN `/configuracion` (Perfil) renders
- THEN it shows the same back-icon-plus-title header as the Categorías list, produced entirely by the
  shared `ConfiguracionLayout`/`ConfiguracionTabs` chrome — with no change made inside `PerfilPanel` or
  `PerfilForm`

### Requirement: WCTM-05 — CA-04: edit screen stacks Nombre/Bucket for the full mobile range and inverts the footer order (CA-04, frame M3)

Below `md` (768px) — the full mobile range D-1 defines, not only the 360px floor WCTG-13 already
guarantees — `EditarCategoria`'s `Nombre` and `Bucket` fields MUST render stacked, not side by side.

`EditarCategoria`'s existing field grid activates side-by-side at `sm` (640px), a boundary narrower than,
and predating, the mobile range D-1 now defines. Between 640px and 767px inclusive, the `sm` boundary alone
renders the fields side by side, which does NOT satisfy this requirement's mobile domain. Closing this gap
— moving this grid's own boundary to `md`, or an equivalent mechanism — is required for this requirement to
hold across its full stated domain; `sdd-design`/`sdd-tasks` MUST account for it explicitly, and
verification MUST NOT rely solely on the 360px width WCTG-13 already covers.

Below `md`, the footer's button order MUST invert relative to WCTG-05's shipped one-row layout: `Guardar`
renders first, full-width; `Cancelar` renders below it, as a text-style (not full-width) button. This
requirement does NOT require separating `Guardar`/`Cancelar` from the red `Eliminar categoría` — WCTG-05's
single-footer-row, two-commit-honesty guarantee is otherwise unchanged; only the `Guardar`/`Cancelar`
sub-order and `Guardar`'s full-width treatment change.

#### Scenario: Nombre and Bucket stack across the full mobile range, not only at 360px (Playwright)

- GIVEN the viewport width is anywhere below `md` (768px), including the 640–767px range the existing `sm`
  boundary does not cover
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render stacked — `sdd-tasks` MUST add real-viewport coverage inside 640–767px,
  since neither of D-3's named widths (360px, 880px) falls inside that gap and would therefore miss a
  regression there

#### Scenario: Guardar renders full-width above a text-style Cancelar (Playwright)

- GIVEN the viewport is below `md`
- WHEN the edit screen's footer renders
- THEN `Guardar` renders first, full-width, and `Cancelar` renders below it as a smaller, text-style control

#### Scenario: Eliminar categoría stays in the same footer as Guardar/Cancelar at mobile widths (jsdom)

- GIVEN the viewport is below `md`
- WHEN the edit screen's footer renders
- THEN the red `Eliminar categoría` control renders in the same footer as `Guardar`/`Cancelar` — CA-04 does
  not require it to move to a separate section, and this scenario exists precisely so that requirement is
  not silently over-implemented

### Requirement: WCTM-06 — CA-05: five Configuración strings resolve per tier, including a non-monotonic Nueva categoría (CA-05, frames M2/T2)

> **Correction (sdd-verify, 2026-08-14)**: this heading read "six" while the table below lists
> **five** rows. The sixth responsive string on this surface — CA-02's list footer note — is
> governed by `WCTM-03`, not by this requirement, so the table is right and the count was wrong.
> Corrected before archive so the miscount does not propagate into the canonical spec. No
> requirement, scenario, or string changed; implementation and tests were already correct
> (five `EtiquetaResponsiva` call sites in production, matching the five rows).

The following strings MUST resolve to the value named for each tier — mobile <768px, tablet 768–1023px,
desktop ≥1024px (WCTM-01):

| String | Desktop (≥1024) | Tablet (768–1023) | Mobile (<768) |
|---|---|---|---|
| Patterns section heading | `Patrones de auto-categorización` | `Patrones de auto-categorización` (unchanged) | `Patrones` |
| Add-pattern control | `Agregar patrón` | `Agregar patrón` (unchanged) | `Agregar` |
| Zero-patterns note (WCTG-06) | `Sin patrones, la categoría solo se puede asignar manualmente.` | (unchanged) | `Sin patrones: solo asignación manual.` |
| List subtitle `Tu catálogo propio…` | rendered | rendered (unchanged) | omitted |
| `Nueva categoría` button label | `Nueva categoría` | `Nueva` | `Nueva categoría` |

The `Nueva categoría` row is **non-monotonic** — long at desktop, short at tablet, long again at mobile —
because CA-01 names the full string `Nueva categoría` for frame M2's full-width button (which has room for
the long label), while CA-05 separately names the tablet shortening `Nueva` for frame T2's narrower,
fixed-width button. A mapping that shortens monotonically as width decreases does NOT satisfy both CA-01
and CA-05 simultaneously; a mechanism keyed only on a single boolean threshold (the two-`<span>` idiom
already used elsewhere in this codebase) cannot express this three-way, non-monotonic mapping directly.

#### Scenario: Patrones/Agregar/note/subtitle shorten only below `md`, tablet matches desktop (Playwright)

- GIVEN the viewport is 1280px, then 880px, then 360px in turn
- WHEN `PatronesSection` and `CategoriasPanel` render at each width
- THEN 1280px and 880px both render the long forms (`Patrones de auto-categorización`, `Agregar patrón`,
  the long zero-patterns note, and the subtitle), and only 360px renders the short forms and omits the
  subtitle

#### Scenario: Nueva categoría is non-monotonic — long at mobile and desktop, short only at tablet (Playwright)

- GIVEN the viewport is 1280px, then 880px, then 360px in turn
- WHEN the `Nueva categoría` button renders at each width
- THEN 1280px and 360px both render `Nueva categoría`, and only 880px renders `Nueva`

#### Scenario: Which string is rendered is verifiable, not merely present in the markup (Playwright)

- GIVEN a CSS-only mechanism where both the short and long forms of a string exist in the DOM
  simultaneously, one hidden by a viewport-scoped utility class
- WHEN the active viewport is asserted against
- THEN the assertion is made against rendered/visible content at a real viewport, not against the mere
  presence of a string literal in markup — the same class of gap `WCTG-02`'s icon-suppression risk names,
  and the exact gap that shipped `WCTG-14` false

### Requirement: WCTG-13 — Mobile viewport floor stays a floor; the M2/M3 restructure lands in `WCTM-*` (decision 8, §J; scope clause repaired by US-063)

At a 360px viewport, both screens MUST still guarantee the three floors below — unchanged from the original
requirement: (a) no horizontal overflow/scroll; (b) `Nombre` and `Bucket` render stacked, not side by side;
(c) every interactive control (row actions, footer buttons, tab links) has a touch target of at least
24×24 CSS px (WCAG 2.2 AA SC 2.5.8, ADR-018). These three floors are a MINIMUM every viewport below `md`
(768px) MUST clear — never a ceiling. `WCTM-01..06` (US-063, this change) now define the actual M2/M3
restructure: horizontal tabs, a single row icon, back-icon IA replacing the h1/breadcrumb, an inverted
footer, and shortened labels.
(Previously: this requirement's own text carved the M2/M3 restructure OUT of scope and assigned it to
"US-063 (#332)" as future work. That clause is now false — this change IS US-063 — and is retired; the
floors below are unchanged and still hold.)

#### Scenario: No horizontal overflow at 360px

- GIVEN the viewport is 360px wide
- WHEN either screen renders
- THEN no element causes horizontal scrolling

#### Scenario: Nombre and Bucket stack at 360px

- GIVEN the viewport is 360px wide
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render as a stacked column, not side by side

#### Scenario: Every interactive target meets the 24×24 CSS px minimum

- GIVEN the viewport is 360px wide
- WHEN row actions, footer buttons, and tab links are measured
- THEN each has a touch target of at least 24×24 CSS px

### Requirement: WCTG-14 — CA-06 tablet renders correctly at the `md` breakpoint (repaired; supersedes "no new tier", US-063 D-1/D-2)

T2 (list) and T3 (edit) MUST render correctly with a fixed-width sidebar/tab column beside a fluid content
column, activated at `md` (768px) — the tier US-063 D-1 introduces — not at `lg` (1024px), and not without
any new breakpoint entry as originally written. At tablet width, `Nombre` and `Bucket` MUST stay side by
side (unlike the mobile floor in WCTG-13), and pattern rows shrink proportionally with the fluid column.
(Previously: this requirement asserted reuse of `WCFG-11`'s existing `lg` grid "with NO new entry added to
`layout.ts`", and its first scenario claimed that at T2/T3's measured width (880px) "the tab/sidebar column
is fixed-width, the content column is fluid". That scenario was FALSE as shipped: `ConfiguracionLayout`'s
grid activated at `lg` (1024px), and 880 < 1024, so the grid fell back to `grid-cols-1` — the same stacked
layout mobile got. The requirement was self-contradictory at spec-freeze: it demanded reuse of the existing
`lg` grid AND a fixed tab column at 880px, and those could not both hold. This repair moves the boundary to
`md` (768px), where 880 ≥ 768 holds, making the scenario true. The "no new entry in `layout.ts`" guarantee
is preserved even though the boundary moves: `md` is expressed as a literal `md:`-prefixed utility class,
the same mechanism `lg:` already used, with no config-file entry required — see WCTM-01.)

#### Scenario: Tablet width gets the fixed tab/content grid via the `md` breakpoint (repaired)

- GIVEN the viewport is at T2/T3's measured width (880px)
- WHEN the list and edit screens render
- THEN the tab/sidebar column is fixed-width and the content column is fluid — because 880px is ≥ `md`
  (768px), the tier US-063 D-1 introduces, not because of `lg` (1024px), which 880px never reached
  (880 < 1024) — the exact arithmetic gap that shipped this scenario false originally

#### Scenario: Nombre and Bucket stay side by side at tablet width

- GIVEN the viewport is at T3's measured width
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render side by side, not stacked

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

### Requirement: WPER-05 — Changing the period routes through the URL param; the selection-reset effect is retired

Any period change performed through prev, next, or "Hoy" MUST route through the URL search param path — on
the dashboard and on the Detalle MES-BUCKET page's `PeriodoSelector` — with no parallel state source
introduced for period (WDM-02). The US-047 bucket-selection-reset effect in `ResumenScreen` is retired with
the panel: there is no selection state left to reset (WDM-06).
(Previously: the requirement existed to keep the pre-existing bucket-selection-reset effect firing
unchanged; the effect is gone with the interim panel — the URL-param routing clause survives.)

#### Scenario: A period change always updates the URL param, nowhere else

- GIVEN the dashboard (or the Detalle MES-BUCKET page) is viewing `2026-07`
- WHEN the user navigates via prev, next, or "Hoy"
- THEN the URL `periodo` param changes, a refetch occurs, and no parallel state source holds the period

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

### Requirement: WG5-01 — Main chart renders as a 4-wedge donut, proportions from a client-side share-of-spending apportionment, not from `porcentajeBp` (CA-01, CA-06, ADR-024)

The dashboard's main chart MUST render as a ring (donut), replacing today's filled pie, with exactly 4
wedges — Necesidades, Deseos, Ahorro, Sin categoría — in that order. Wedge proportions MUST be derived from
`calcularDistribucionGasto`'s share-of-spending ratio: a largest-remainder apportionment computed
client-side over the raw BigInt totals of the 4 `BUCKETS_ANILLO` items. This is the same pre-existing
client-side derivation the app already performed before this change (previously over the 3 spend buckets
only); this change extends its input set to 4 by adding Sin categoría. It is a sanctioned presentation
derivation under ADR-024 — it changes neither the money shown nor how a transaction is classified, only how
already-shown totals are apportioned into wedge angles.

This wedge-proportion value is DISTINCT from `porcentajeBp` — the backend's income-share 50/30/20 metric.
`porcentajeBp` MUST continue to pass through verbatim, unmodified, but ONLY where it is used today:
`BucketViewModel.porcentajeLabel`. `porcentajeBp` is NOT the source of the ring's wedge angles, of the
legend's spend-bucket percentages (`WG5-03`), or of the IDEAL 50/30/20 inset's wedge ratios — the inset
derives its own ratios client-side from `dto.targets` (the wire's hardcoded 50/30/20 reference values,
documented "Hardcoded 50/30/20 reference targets", not period data), computed as
`Math.round((valores[bucket] / total) * 100)` in `DistribucionPie.tsx`'s `slicesIdeales`. This is a third,
pre-existing client-side percentage derivation, distinct from both the ring apportionment and from
`porcentajeBp`, unchanged by this change (design D-02). See `WG5-13` for the semantic consequence of
widening the ring's denominator to include Sin categoría.

Ingresos MUST NOT appear as a ring wedge — it is excluded by construction (its item never enters the ring's
data set), not filtered out at render time.

#### Scenario: The ring renders exactly 4 wedges, in the fixed bucket order (jsdom)

- GIVEN a period with data in all 4 spend-and-uncategorized items
- WHEN the dashboard's chart renders
- THEN the ring shows exactly 4 wedges, ordered Necesidades, Deseos, Ahorro, Sin categoría — never a
  5th wedge for Ingresos

#### Scenario: Wedge proportions equal `calcularDistribucionGasto`'s share-of-spending ratio, not `porcentajeBp` (jsdom)

- GIVEN the raw BigInt totals for the 4 `BUCKETS_ANILLO` items
- WHEN the ring's wedge angles are computed
- THEN each wedge's arc is proportional to that item's share of the combined ring total, apportioned via
  `calcularDistribucionGasto`'s existing largest-remainder rule so the four wedges sum to exactly 100 —
  never derived from `porcentajeBp`

#### Scenario: Ingresos never appears as a ring wedge, even when it is the largest amount (jsdom)

- GIVEN a period where `totalIngreso` is larger than any spend bucket's total
- WHEN the ring renders
- THEN it still shows only the 4 wedges above — Ingresos has no ring representation at any amount

### Requirement: WG5-02 — `PeriodoSelector` stays page-level and unchanged; the semáforo tag renders in the chart card's own header row — an accepted deviation from the wireframe's single combined row (CA-01, CA-03)

`PeriodoSelector` MUST remain exactly where it already lives — at the page level in `ResumenPage`, governed
unchanged by `WPER-01..07`/`WMYP-01..08` — and MUST NOT be relocated into the chart card; this change makes
no change to that component or its requirements. This is an intentional, accepted deviation from the
wireframe: the wireframe draws the month label and the semáforo tag on a single combined row above the
chart, but this change does not relocate `PeriodoSelector` to achieve that literal layout. Instead, the
semáforo tag (`WG5-07`) renders in the chart card's OWN header row, next to the card's title, per the
design's component placement. The net reading — a period control above the card, and a semáforo tag on the
card's own header — is the approved interim layout for this change; a future US may revisit the exact
wireframe row composition, but this change MUST NOT attempt the relocation.

#### Scenario: `PeriodoSelector` remains page-level, unchanged (jsdom)

- GIVEN the redesigned dashboard
- WHEN the page and the chart card render
- THEN `PeriodoSelector` renders once, at the page level, exactly as `WPER-01..07`/`WMYP-01..08` already
  specify — no forked copy, no relocation into the chart card, no divergent behavior introduced by this
  change

#### Scenario: The semáforo tag renders in the chart card's header row, not the page-level selector row (jsdom)

- GIVEN the redesigned chart card
- WHEN it renders
- THEN the semáforo tag (`WG5-07`) appears in the card's own header row, next to the card's title — this
  is the accepted layout deviation from the wireframe's single combined row, not a defect

### Requirement: WG5-03 — Legend renders exactly 5 rows, in a fixed order, with a divider between spend items and the remainder (CA-02)

The legend MUST render exactly 5 rows in this fixed order: Necesidades, Deseos, Ahorro (each shaped
`name · % · CLP amount` with a color dot and a chevron, clickable), a visual divider, Ingresos (shaped
`name · CLP amount` — no `%` — clickable, navigating to `/ingresos` per `WG5-06`), and Sin categoría (shaped
`name · N tx · CLP amount` with a chevron, clickable), where `N` is `cantidadSinCategoria` from the wire
response. The 3 spend-bucket
percentages MUST be the same ring-share value the ring itself uses for that bucket (`WG5-01`) —
`calcularDistribucionGasto`'s client-side share-of-spending apportionment over the 4 `BUCKETS_ANILLO`
totals, not `porcentajeBp`. The legend performs no independent percentage computation of its own; it reuses
the ring's own value. Activating a clickable row MUST navigate to that bucket's Detalle MES-BUCKET page
(`WCAT-01`, `WDM-06`) — never swap an inline panel.

The Sin categoría legend row's `%`-omission is scoped to the LEGEND row only. The ring's on-wedge label
follows the same uniform `≥5 %` rule for all 4 wedges (pre-existing `showLabels` behavior in
`DistribucionPie.tsx`, kept unchanged per design D-08) — the Sin categoría wedge shows its
on-wedge percentage exactly like any other wedge when its share is `≥5 %`; only the legend row drops the
`%` in favor of the transaction count.

The divider between the spend-bucket rows and the Ingresos/Sin categoría rows is viewport-conditional: it
MUST render at the desktop tier (`lg:` and above, ≥1024px) and MUST NOT render at the T1 tablet tier
(768–1023px) or below — a CSS-only conditional (e.g. `hidden lg:block`), never JS branching. This mirrors a
documented wireframe difference between the T1 tablet mock (no divider) and the desktop mock (divider
present); see `WG5-10` for the rendered-geometry proof.
(Previously: activating a clickable row swapped the dashboard's inline US-047 panel; this change retires
the panel — rows now navigate to the Detalle MES-BUCKET page.)
(Previously: the Ingresos row was NOT clickable — no interactive role, no navigation; US-054 makes it a
navigation target to `/ingresos` (`WG5-06`).)

#### Scenario: Exactly 5 rows render in the fixed order (jsdom)

- GIVEN a period with data across all items
- WHEN the legend renders
- THEN it shows exactly 5 rows in order: Necesidades, Deseos, Ahorro, [divider], Ingresos, Sin categoría

#### Scenario: Each spend-bucket row shows name, percentage, amount, and a chevron, and is clickable (jsdom)

- GIVEN the Necesidades row
- WHEN it renders
- THEN it shows the bucket name, its ring-share percentage (the same value driving its wedge, `WG5-01`),
  its CLP amount, a color dot, and a chevron, and activating it navigates to `/buckets/Necesidades` with
  the current `periodo` (`WCAT-01`, `WDM-06`)

#### Scenario: The Ingresos row has no percentage but navigates to `/ingresos` (jsdom)

- GIVEN the Ingresos row
- WHEN it renders
- THEN it shows only the name and the CLP amount (no `%`), and activating it (mouse or keyboard) navigates
  to `/ingresos` carrying the current `periodo` (`WG5-06`) — it is a real interactive/focusable control

#### Scenario: The Sin categoría row shows its transaction count from `cantidadSinCategoria` (jsdom)

- GIVEN a period where the backend reports `cantidadSinCategoria: 7`
- WHEN the Sin categoría legend row renders
- THEN it shows the name, `7` as its transaction count, its CLP amount, and a chevron, and activating it
  navigates to `/buckets/SinCategoria` with the current `periodo` plus `destacar` (`WDM-04`, `WDM-06`)

### Requirement: WG5-04 — Sign prefix is a pure client-side derivation by item kind; backend magnitudes stay unsigned (CA-02, ADR-024)

Amount rendering MUST prefix `−` for the 3 spend buckets and Sin categoría, and `+` for Ingresos. This sign
MUST be chosen by the view-model from the item's kind (spend/uncategorized vs. income) — never read off the
wire, since the backend continues to send unsigned magnitudes for every amount field (`total`,
`totalIngreso`). No other client-side derivation beyond sign prefix, CLP formatting, and labels is permitted
on these amounts (ADR-024 guard, same boundary `WG5-01` states for percentages/estado).

#### Scenario: Spend buckets and Sin categoría render a minus sign (jsdom)

- GIVEN the Necesidades, Deseos, Ahorro, and Sin categoría rows
- WHEN their amounts render
- THEN each is prefixed with `−`, even though the backend's `total`/equivalent field for each is an
  unsigned magnitude

#### Scenario: Ingresos renders a plus sign (jsdom)

- GIVEN the Ingresos row
- WHEN its amount renders
- THEN it is prefixed with `+`, derived from the row being the Ingresos kind — not from any sign present on
  `totalIngreso` itself (which stays unsigned on the wire)

### Requirement: WG5-05 — `esResumenMesDto` gains a `cantidadSinCategoria` guard, and the view-model maps a real zero as a real zero, never an omission (CA-02)

`esResumenMesDto` (`apps/web/src/api/client.ts`) does not currently validate `cantidadSinCategoria` — a
payload missing the field, or carrying it as the wrong type, passes the guard unchanged today. Extending
`esResumenMesDto` to require `typeof cantidadSinCategoria === 'number'` (alongside the pre-existing
`totalIngreso` check) IS IN SCOPE of this change, since the legend now depends on the field and a payload
that silently lacks it must be rejected the same way any other structurally invalid `ResumenMesDto` already
is. Once a valid payload is guaranteed, the view-model MUST map `cantidadSinCategoria` and `totalIngreso`
into the legend's Sin categoría and Ingresos rows respectively, and `cantidadSinCategoria: 0` MUST map to a
genuine, rendered zero — the view-model MUST treat a valid zero as data, not as a signal that the field is
absent, and MUST NOT silently render a row that looks identical to an omitted one.

#### Scenario: A payload missing `cantidadSinCategoria`, or carrying the wrong type, is rejected by the DTO guard (jsdom)

- GIVEN a `/api/resumen` payload that omits `cantidadSinCategoria`, or sends it as a non-number
- WHEN `esResumenMesDto` validates the payload
- THEN it returns `false`, and the existing error path (the same one `WAC-02` already exercises for other
  malformed fields) handles it — no new error-handling code is introduced

#### Scenario: `cantidadSinCategoria: 0` is mapped as a real zero, not treated as an omitted field (jsdom)

- GIVEN a period where every transaction is categorized (`cantidadSinCategoria: 0`)
- WHEN the legend renders
- THEN the Sin categoría row still renders, showing `0` transactions and its (zero) amount — the
  view-model treats the valid zero as data, and the row is never omitted

### Requirement: WG5-06 — Ingresos navigates to its Detalle MES-INGRESOS page; the US-047 interim comment is removed (CA-04)

The Ingresos legend row MUST be clickable, MUST be a focusable interactive element, and MUST navigate to
`/ingresos` carrying the current `periodo` search param (`WDI-01..08`). The US-047 interim comment at the
row's implementation site — which claimed no Ingresos drill-down endpoint exists — MUST be removed: the
endpoint exists (US-052, `ingresos-detalle-mes` MID-01..06). The pie has no Ingresos wedge and
`IngresoCard` is untouched — the legend row is the ONLY Ingresos click surface (CA-04).
(Previously: the Ingresos legend row MUST NOT be clickable, MUST NOT be a focusable interactive element,
and MUST NOT trigger any navigation, and the interim (no drill-down endpoint yet) was documented as a
comment at the row's implementation site.)
(Previously: the 4 clickable rows' behavior was an inline panel drill-down "unchanged" by US-049; this
change turns that drill-down into navigation, so the Ingresos exclusion is restated against navigation.)

#### Scenario: Activating the Ingresos row navigates to `/ingresos` (jsdom)

- GIVEN the Ingresos legend row
- WHEN the user clicks it, or tabs to it and presses Enter/Space
- THEN the URL becomes `/ingresos` with the current `periodo` — the row carries an interactive role and is
  reached by Tab

#### Scenario: Sin categoría, the 3 spend buckets, and Ingresos all navigate (jsdom)

- GIVEN the same legend render
- WHEN the user clicks the Sin categoría row, any spend-bucket row, or the Ingresos row
- THEN the spend buckets and Sin categoría navigate to their Detalle MES-BUCKET pages (`WCAT-01`/`WDM-06`)
  and Ingresos navigates to `/ingresos` (`WG5-06`) — navigation is the only drill-down behavior these rows
  have after this change

### Requirement: WG5-07 — The semáforo is a clickable tag at the chart's top-right, navigating to `/semaforo` — a TRANSVERSAL rule for every chart, not only this one (CA-03)

The semáforo indicator MUST render as a clickable tag (`Semáforo: {estado} ›`, using the same Spanish
state label `SemaforoBadge` already exposes — `Verde`/`Amarillo`/`Rojo`) positioned at the dashboard main
chart's top-right, replacing today's static, non-interactive badge. Activating it (click or keyboard) MUST
navigate to `/semaforo`. This is a TRANSVERSAL rule: the semáforo is a clickable entry point on ANY chart
that renders it, not a decorative badge scoped to this one card — a future chart that renders a semáforo
indicator MUST make it a clickable tag with the same navigation target, not reintroduce a static badge.

#### Scenario: The tag renders at the chart's top-right with the state-labeled copy (jsdom)

- GIVEN a period with `estadoGlobal: 'verde'`
- WHEN the dashboard's main chart renders
- THEN a clickable tag reading `Semáforo: Verde ›` (or the equivalent for the current state) renders at the
  chart's top-right

#### Scenario: Activating the tag navigates to `/semaforo`, by mouse or keyboard (jsdom)

- GIVEN the semáforo tag is rendered
- WHEN the user clicks it, or tabs to it and activates it with Enter/Space
- THEN the app navigates to `/semaforo`

### Requirement: WG5-08 — A `null` `estadoGlobal` renders the tag as "Semáforo: Sin datos ›", still a navigable link, mirroring the existing "Sin datos" precedent (CA-03)

WHEN `estadoGlobal` is `null` (e.g. an empty-data period), the semáforo tag MUST still render as a
navigable `<Link>` — never omitted from the layout, never disabled, never a non-interactive element —
using the existing "Sin datos" treatment `SemaforoBadge` already applies for a `null` state. Activating it
MUST navigate to `/semaforo` exactly like any other state, per `WG5-07`; the destination page owns
explaining the no-data state, not the tag. Its accessible name MUST reflect the "Sin datos" label so
assistive technology conveys the same information as the visible text. This mirrors the existing SIN_DATOS
badge precedent (a distinct, always-rendered state, never coerced into a colored state) — extended here to
keep the tag a single, always-navigable control rather than introducing a disabled or hidden variant.

#### Scenario: An empty period renders a navigable "Sin datos" tag that still navigates to `/semaforo` (jsdom)

- GIVEN a period where `estadoGlobal` is `null`
- WHEN the dashboard's main chart renders
- THEN the semáforo tag renders showing `Semáforo: Sin datos ›`, exposes an accessible name reflecting
  "Sin datos", and activating it (click or keyboard) navigates to `/semaforo` exactly as any other state

## Semáforo Detail Page (`/semaforo`)

Source: `openspec/changes/us-049-semaforo-detalle/proposal.md` (US-049, issue #283). Every
requirement below traces to a CA-0N from the proposal (verbatim where quoted) or to a specific
proposal decision named in its own text. New requirements use a fresh family, **`WSEM-*`** (Web
Semáforo detail) — the proposal's own suggested `/semaforo` scope — rather than extending
`WG5-*` (dashboard main chart) or `WCAT-*` (bucket drill-down), because `/semaforo` is a
standalone detail page, not a modification to the dashboard's chart, legend, or panel.

Two scenario labels are used below, per the precedent this repo already established (`WCTG-14`,
`WCTM-01..06`, `WG5-*`):

- **(jsdom)** — the scenario's truth is DOM structure, text content, an accessible name/role, or a
  pure function's return value — verifiable by the existing Vitest/jsdom suite.
- **(Playwright)** — the scenario's truth depends on rendered geometry (layout variant, position)
  at a real viewport. `pnpm web test` (jsdom) CANNOT verify these.

This change scopes no new responsive/tablet layout work — a mobile version of `/semaforo` is
explicitly out of scope (per the proposal). Every scenario below is (jsdom)-labeled; a future
change introducing a mobile `/semaforo` layout would add its own (Playwright) scenarios then, not
here.

**Reused, unchanged families (not restated here):**

- `WG5-07`/`WG5-08` (the dashboard's clickable semáforo tag navigating to `/semaforo`, including
  its "Sin datos" null-state handling) are unchanged by this change — `/semaforo` is the
  navigation *target*, not the tag itself.
- The `_authenticated` session guard is reused unchanged (previously asserted by `WG5-09`, now
  asserted by `WSEM-07` below).

### Requirement: WSEM-01 — Header renders the month, a static semáforo badge, and the diagnosis, adopting `SemaforoBadge` (CA-01, CA-02)

The `/semaforo` page header MUST render: the viewed month (reusing the existing month-label
convention already governed by `WPER-01`/`WMYP-*`), a STATIC (non-clickable) semáforo badge
showing `estadoGlobal` — reusing the existing `SemaforoBadge` component, adopting it for genuine
reuse (closing issue #382) rather than building a new header treatment — and the diagnosis
sentence from `GET /api/resumen/semaforo` (`resumen-semaforo` SEM-01) rendered verbatim as page
copy, with no client-side re-derivation or templating.

#### Scenario: Header shows the month, a static badge, and the exact diagnosis text (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns `estadoGlobal='amarillo'` and a diagnosis sentence
- WHEN `/semaforo` renders
- THEN the header shows the viewed month, `SemaforoBadge` in the Amarillo state, and the diagnosis
  sentence verbatim

#### Scenario: The header badge is a static indicator, not a navigable link (jsdom)

- GIVEN `/semaforo` has rendered
- WHEN the header badge is inspected
- THEN it exposes no interactive/link role — unlike the dashboard's clickable semáforo tag
  (`WG5-07`), the badge here is a static status indicator, since the user is already on `WG5-07`'s
  navigation destination

### Requirement: WSEM-02 — Page states explicitly that the global state is the worst of the 3 spend buckets (CA-03)

The page MUST render a short, static explanation stating that the global semáforo state is
determined by whichever of Necesidades/Deseos/Ahorro is in the worst state. This copy is static
UI text describing the rule, distinct from the per-period diagnosis sentence (`WSEM-01`).

#### Scenario: The worst-of-3 explanation is present regardless of state (jsdom)

- GIVEN any `estadoGlobal` value
- WHEN `/semaforo` renders
- THEN a visible sentence explains that the global state reflects the worst of the 3 spend buckets

### Requirement: WSEM-03 — Each spend bucket renders a row with a zone bar whose bands come from the wire, never a client-side constant (CA-04)

For each of Necesidades, Deseos, Ahorro, the page MUST render a row showing: the bucket's
percentage against its target, its own `estadoSemaforo`, and a zone bar visualizing where the
bucket's `porcentajeBp` falls relative to the Verde/Amarillo/Rojo bands. The zone bar's band
positions and widths MUST be computed from the band-edge values `GET /api/resumen/semaforo`
returns (`resumen-semaforo` SEM-02) — the component MUST NOT hardcode Necesidades' 50/60, Deseos'
30/40, or Ahorro's 20/40/10/50 as literal threshold numbers anywhere in the web codebase.

#### Scenario: Each bucket row shows its own percentage, estado, and zone bar (jsdom)

- GIVEN a `GET /api/resumen/semaforo` response with Necesidades at 5500bp (Amarillo)
- WHEN `/semaforo` renders
- THEN the Necesidades row shows its percentage, an "Amarillo" state, and a zone bar

#### Scenario: Zone bar band positions come from the wire, not a hardcoded constant (jsdom)

- GIVEN a test double response where Necesidades' band edges differ from the domain's real
  constants (e.g. `verdeMax=5500`/`amarMax=6500` instead of `5000`/`6000`)
- WHEN `/semaforo` renders
- THEN the rendered zone bar reflects the response's band edges, not `5000`/`6000` — proving the
  values are read from the wire, not from a client-side constant

#### Scenario: No zone-bar or bucket-row source contains a hardcoded threshold literal (jsdom)

- GIVEN the web codebase's zone-bar and bucket-row component source
- WHEN it is inspected (e.g. by a source-scanning test asserting the literals' absence)
- THEN none of the 8 domain threshold basis-point values (`5000`, `6000`, `3000`, `4000`, `2000`,
  `1000`) appears as a classification constant used to compute the bar's geometry or estado

### Requirement: WSEM-04 — Every Amarillo/Rojo bucket shows a CLP advice row with the correct framing; Ahorro covers both sides (CA-05)

When a bucket's `estadoSemaforo` is Amarillo or Rojo, its row MUST render the advice sentence the
API returns verbatim (`resumen-semaforo` SEM-03's `mensaje`, per `resumen-semaforo` SEM-10's
mensaje contract), with the client substituting the single `{monto}` placeholder with the
CLP-formatted amount. Two framings exist, both tuteo: an imperative reduce/increase framing for
Necesidades, Deseos, and Ahorro's low side —
`Para volver a Verde, {reduce|aumenta} {monto} en {bucket} este mes.` — and an informational
framing for Ahorro's high side —
`Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.` A Verde
bucket MUST NOT render an advice row.

#### Scenario: An over-target Necesidades shows the imperative reduce-framed advice row (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Necesidades with `estadoSemaforo='rojo'` and a
  `mensaje` of `Para volver a Verde, reduce {monto} en Necesidades este mes.`
- WHEN `/semaforo` renders
- THEN the Necesidades row shows `Para volver a Verde, reduce {monto} en Necesidades este mes.`
  with `{monto}` substituted by the CLP-formatted amount

#### Scenario: A below-band Ahorro shows the imperative increase framing (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Ahorro with `estadoSemaforo='amarillo'` and a
  `mensaje` of `Para volver a Verde, aumenta {monto} en Ahorro este mes.`
- WHEN `/semaforo` renders
- THEN the Ahorro row shows `Para volver a Verde, aumenta {monto} en Ahorro este mes.` with
  `{monto}` substituted by the CLP-formatted amount, not the informational framing

#### Scenario: An above-band Ahorro shows the informational framing (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Ahorro with `estadoSemaforo='amarillo'` and a
  `mensaje` of `Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en
  Verde.` (the above-band case, not Necesidades/Deseos' unilateral reduce)
- WHEN `/semaforo` renders
- THEN the Ahorro row shows `Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y
  quedar en Verde.` with `{monto}` substituted by the CLP-formatted amount, not the imperative
  framing

#### Scenario: A Verde bucket shows no advice row (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Deseos with `estadoSemaforo='verde'`
- WHEN `/semaforo` renders
- THEN the Deseos row shows no advice sentence

### Requirement: WSEM-05 — Sin categoría warning shows count and total, and links to its bucket detail (CA-06)

The page MUST render a Sin categoría warning showing its transaction count and total (from
`resumen-semaforo` SEM-05) and a link navigating to `/buckets/SinCategoria` (the existing
bucket-detail route, `WCAT-*`). The warning MUST be softened or omitted when the count is zero,
consistent with the app's existing zero-impact softening precedent (`WCTG-08`).

#### Scenario: A nonzero Sin categoría count renders the warning with a working link (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns a nonzero Sin categoría count and total on the wire
- WHEN `/semaforo` renders
- THEN a warning shows the count and total, with a link that navigates to
  `/buckets/SinCategoria`

#### Scenario: A zero Sin categoría count is softened or omitted (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns a Sin categoría count of zero on the wire
- WHEN `/semaforo` renders
- THEN the warning is not shown in its full alarming form (softened or omitted)

### Requirement: WSEM-06 — A no-income month renders a self-explanatory state instead of empty percentages (CA-07)

WHEN the response's `sinIngreso` (or equivalent) is true, the page MUST render an explanation of
the no-income state — using the backend's no-income diagnosis (`resumen-semaforo` SEM-06) —
instead of rendering bucket rows with empty or null percentages, zone bars, or advice rows.

#### Scenario: A no-income period renders the no-income explanation, not empty bucket rows (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns `sinIngreso=true`
- WHEN `/semaforo` renders
- THEN the no-income diagnosis renders, and no bucket row renders an empty percentage, zone bar,
  or advice row

### Requirement: WSEM-07 — Deep link honours `periodo`, and "Volver" returns to the dashboard preserving it (CA-08)

`/semaforo` MUST resolve its data for the `periodo` carried in its URL search param — unchanged
arrival behavior, already covered by `semaforo-route.test.tsx`'s existing arrival assertion — and
MUST remain session-protected like every other `_authenticated` route (unchanged guard, previously
asserted by the now-superseded `WG5-09`). The page's "Volver" control MUST navigate back to `/`
carrying the SAME `periodo` forward as a search param (`Link search={{ periodo }}`) — fixing the
existing stub's bug, where the return link dropped `periodo` and silently reset the dashboard to
the current month.

#### Scenario: Volver preserves the periodo that was being viewed (jsdom)

- GIVEN `/semaforo` was opened with `periodo=2026-03`
- WHEN the user activates "Volver"
- THEN the URL becomes `/` with `periodo=2026-03` preserved, not the current month

#### Scenario: Arrival still honours a deep-linked periodo (regression guard, jsdom)

- GIVEN a deep link to `/semaforo?periodo=2026-03`
- WHEN the page loads
- THEN the data shown corresponds to `periodo=2026-03`, unchanged from the existing stub's arrival
  behavior

#### Scenario: `/semaforo` remains session-protected (regression guard, jsdom)

- GIVEN no active session
- WHEN the browser navigates to `/semaforo`
- THEN it redirects to `/login?redirect=/semaforo`, via the existing `_authenticated` guard — no
  new guard code is introduced

### Requirement: WSEM-08 — The zone bar conveys state through text, never color alone (ADR-018, WCAG 2.2 AA)

The zone bar's visual fill MUST be `aria-hidden` (decorative), and every piece of information it
conveys — the bucket's `porcentajeBp`, the band edges, and the resulting estado — MUST also be
present as visible/accessible text near the bar. This mirrors the existing
`SemaforoBadge`/`SemaforoTag`/`MiniSemaforoTag` precedent, which never conveys state via color
alone.

#### Scenario: Zone bar state is available as text, not only as a colored fill (jsdom)

- GIVEN a bucket row with its zone bar rendered
- WHEN the row's accessible text content is inspected with the zone bar's decorative fill excluded
- THEN the bucket's percentage, band edges, and estado are all present as text/accessible content

#### Scenario: The zone bar's visual fill is excluded from the accessibility tree (jsdom)

- GIVEN a bucket row's zone bar
- WHEN its DOM is inspected
- THEN the decorative fill element carries `aria-hidden="true"`, so assistive tech relies on the
  adjacent text, not the visual bar

> WG5-09 removed by us-049-semaforo-detalle — the stub was replaced by the real page (WSEM-01..WSEM-08).

### Requirement: WG5-10 — The T1 tablet variant renders correctly, verified by rendered geometry at a real viewport, never by className presence alone (CA-05)

The dashboard main chart card MUST render a T1 tablet layout variant within the tablet tier this spec
already establishes elsewhere (`WCTM-01`: 768–1023px, expressed as literal `md:`-prefixed utilities on the
chart card, no new entry in `layout.ts`, no `AppShell` change). Verification MUST assert against real
rendered geometry/layout at a tablet viewport width — asserting only that a `md:`-prefixed class string is
present in the markup does NOT prove the variant is in effect at that width, the exact gap that shipped
`WCTG-14` false.

#### Scenario: The tablet variant renders at a representative tablet width (Playwright)

- GIVEN the viewport is within the tablet tier (768–1023px)
- WHEN the dashboard's main chart card renders
- THEN it matches the wireframe's tablet (T1) layout variant, asserted by rendered/computed geometry at
  that real viewport — including that the legend's divider between the spend-bucket rows and
  Ingresos/Sin categoría is NOT rendered (absent from the visual/accessible tree) at this viewport,
  distinguishing T1 from the desktop layout, where it is rendered (`WG5-03`)

#### Scenario: A `md:`-prefixed class existing in markup is not sufficient proof of the tablet variant (Playwright, anti-pattern named)

- GIVEN a hypothetical implementation where both the desktop and tablet class variants exist simultaneously
  in the rendered markup, one inactive at the current viewport
- WHEN the T1 variant is verified
- THEN the assertion is made against rendered/computed layout at a real viewport — never against the mere
  presence of a `md:`-prefixed string in the DOM, which is exactly the class of gap that shipped `WCTG-14`
  false and MUST NOT be repeated here

#### Scenario: The divider stays absent at the mobile viewport too (Playwright)

- GIVEN the viewport is at the mobile tier (360px)
- WHEN the dashboard's main chart card renders
- THEN the legend's divider between the spend-bucket rows and Ingresos/Sin categoría is NOT rendered
  (absent from the visual/accessible tree, zero-area bounding box) at this viewport too — closing the gap
  where `WG5-03`'s "T1 or below" divider-absence text otherwise has no mobile-viewport geometry proof,
  only the tablet one above

### Requirement: WG5-11 — No estado arithmetic, and no percentage computation beyond the sanctioned ring apportionment, exists in `apps/web` for this chart (CA-06, ADR-024)

The ring, legend, and semáforo tag introduced/modified by this change MUST consume `estadoGlobal`/
`estadoSemaforo` verbatim from the wire — no threshold comparison or estado derivation MUST exist
client-side for these values. Percentage handling is scoped precisely to three named exceptions and no
more:

1. The ring's wedge angles and the legend's 3 spend-bucket percentages are the pre-existing, sanctioned
   `calcularDistribucionGasto` share-of-spending apportionment (`WG5-01`/`WG5-03`; an ADR-024
   presentation-only derivation, extended in this change to 4 items including Sin categoría — see
   `WG5-13`).
2. `porcentajeBp` MUST continue to pass through verbatim wherever it is consumed today
   (`BucketViewModel.porcentajeLabel`), with no recomputation.
3. The IDEAL 50/30/20 inset's wedge ratios are a pre-existing, sanctioned client-side derivation over
   `dto.targets` — the wire's hardcoded 50/30/20 reference values, not period totals — computed as
   `Math.round((valores[bucket] / total) * 100)` in `DistribucionPie.tsx`'s `slicesIdeales`. It is NOT
   derived from `porcentajeBp` and is unchanged by this change (design D-02).

No other client-side percentage or estado arithmetic beyond these three named exceptions is permitted. The
only other client-side derivations permitted on chart data are: sign prefix (`WG5-04`), CLP formatting, and
display labels.

#### Scenario: Ring/legend percentages trace to the sanctioned apportionment, `porcentajeLabel` traces to `porcentajeBp` verbatim, the IDEAL inset traces to `targets`, and estado is never recomputed (jsdom)

- GIVEN the backend response for a period
- WHEN the ring's wedge proportions and the legend's spend-bucket percentages are rendered
- THEN each traces to `calcularDistribucionGasto`'s client-side share-of-spending apportionment over raw
  totals (`WG5-01`), never to `porcentajeBp`
- WHEN `BucketViewModel.porcentajeLabel` renders
- THEN it traces directly to `porcentajeBp` verbatim, with no recomputation
- WHEN the IDEAL 50/30/20 inset's wedge ratios render
- THEN each traces to the pre-existing client-side ratio computed over `dto.targets` (the hardcoded
  reference values), never to `porcentajeBp` and never to period totals
- WHEN the semáforo tag's state label renders
- THEN it traces directly to `estadoGlobal` verbatim — with no intermediate bp-threshold or
  percentage-computation logic in `apps/web` beyond the three named exceptions above

### Requirement: WG5-12 — New/touched files pass `eslint-jsx-a11y` at `error` scope; the donut, legend, and semáforo tag are keyboard-operable and accessible (CA-06, WCAG 2.2 AA, ADR-018)

Every file this change touches (`DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`,
`SemaforoTag.tsx`, `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx` — glob, per the design's
`D-05`/`D-08` file lists) MUST be added to `eslint.config.js`'s scoped `error`-severity
`eslint-jsx-a11y` override, per the
existing US-042/043/063 precedent (`WCFG-12`, `WCTM-*`) and this change's own file lists in design
`D-05`/`D-08`.
The donut ring's `<svg>` MUST expose an accessible name/description (role and aria pattern consistent with
the existing `SemaforoBadge`'s `role="img"` + `aria-label` convention — never color alone). The 3
spend-bucket rows, the Sin categoría row, and the Ingresos row MUST remain keyboard-operable
(Tab/Enter/Space), matching their `<button>` semantics — the Ingresos row is now a real interactive control
(`WG5-06`). The semáforo tag MUST be keyboard-operable (Tab/Enter/Space) with a visible focus ring.
(Previously: only the 3 spend-bucket rows and the Sin categoría row were keyboard-operable; the Ingresos
row was excluded from Tab order under WG5-06's not-clickable rule. US-054 adds the Ingresos page's own
files to the same scoped override — WDI-07.)

#### Scenario: The scoped lint gate is clean on every touched file

- GIVEN the files this change touches
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: The donut ring exposes an accessible name, not color alone (jsdom)

- GIVEN the rendered donut ring
- WHEN it is inspected via the accessibility tree
- THEN it exposes a role and accessible name/description conveying its meaning — not conveyed by color
  alone

#### Scenario: A keyboard-only user can operate every clickable legend row and the semáforo tag (jsdom)

- GIVEN a keyboard-only user tabs through the chart card
- WHEN they reach a spend-bucket row, the Sin categoría row, the Ingresos row, or the semáforo tag, and
  activate it with Enter or Space
- THEN each behaves identically to its mouse-click behavior, with a visible focus ring at every step — the
  Ingresos row is reached by Tab and navigates to `/ingresos` on activation (`WG5-06`)

### Requirement: WG5-13 — Sin categoría entering the ring denominator dilutes the three spend-bucket ring percentages (R-5, CA-06, ADR-024)

Since `BUCKETS_ANILLO` now includes Sin categoría, `calcularDistribucionGasto`'s largest-remainder
apportionment sums across 4 items instead of 3. This MUST be treated as a deliberate, product-approved
semantic change: the Necesidades/Deseos/Ahorro ring percentages (and the matching legend percentages,
`WG5-03`) numerically shrink relative to the previous 3-slice chart whenever Sin categoría carries a
nonzero total, because the same three amounts now share a denominator that also contains a fourth item.
This dilution MUST NOT be treated as a regression to fix — it is the intended reading: a wedge showing 20%
now means "20% of everything in the ring, including what's unclassified," not "20% of my three spend
buckets." This requirement does not change `porcentajeBp` or the 50/30/20 IDEAL inset, which are unaffected
(`WG5-01`, `WG5-11`).

#### Scenario: A period with a non-zero Sin categoría total shows lower ring percentages for the three spend buckets than before this change (jsdom)

- GIVEN a period where Sin categoría carries a non-zero total alongside the three spend buckets
- WHEN the ring's wedge proportions and the legend's spend-bucket percentages are computed
- THEN each of the three spend buckets' shares is smaller than it would be if the denominator excluded Sin
  categoría — this is the intended dilution, not a bug

## Detalle MES-INGRESOS — Income detail page (`/ingresos`)

Source: `openspec/changes/us-054-web-detalle-mes-ingresos/proposal.md` (US-054, issue #288). New
requirements use fresh family **`WDI-*`** (Web Detalle Ingresos) — the `/ingresos` page is a new surface,
not a modification to the dashboard families (`WG5-*`) or the bucket-page family (`WDM-*`).
Scenario labels follow the repo precedent: **(jsdom)** = DOM/text/accessible-name truth;
**(Playwright)** = rendered geometry at a real viewport.

Capabilities with NO delta (proposal §Capabilities): `ingresos-detalle-mes` (MID-01..06, shipped and
archived by US-052) and `user-data-isolation` — the page consumes the wire contract as-is and the backend
is untouched.

### Requirement: WDI-01 — Ingresos page structure: breadcrumb, month + arrows, "N ingresos" tag, positive total, "Sin meta ni semáforo" note (CA-01)

For a month with income, `/ingresos` MUST render: a breadcrumb `Dashboard / Ingresos` whose back/Dashboard
control navigates to `/` carrying `search={{ periodo }}` — a hand-rolled typed `Link` (NOT `BotonVolver`,
whose typed `to` cannot carry search, US-053 D-09), to a fixed named destination, never `history.back()`
(WCTM-04's fixed-destination rule); the reused `PeriodoSelector` (WPER-01..07/WMYP-01..08 semantics); a tag
`{N} ingresos` from the wire's `conteo` (singular/plural per WCTG-03's grammatical-form precedent); the
month total via `formatearMontoConSigno(total, '+')` (positive sign — WG5-04's sign-by-kind rule); and the
static note `Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto` (structural: the
wire carries no meta/porcentaje/estado, MID-03). The month label MUST derive from the search param —
`mesCompletoLabel(periodo ?? periodoActual())` — since the wire has no `periodo` echo (MID-01);
`periodoActual()` is a new pure helper in `domain/periodo.ts` (absent `periodo` → current calendar month,
MID-04). The route's `validateSearch` MUST narrow `periodo` via `normalizarPeriodo`. The back control MUST
meet the 24×24 CSS px floor and carry a non-empty accessible name (WCTM-04's a11y minimum).

#### Scenario: Header renders all CA-01 elements for a real month (jsdom)

- GIVEN `/ingresos?periodo=2026-07` with `conteo: 3` and `total: "1500000"`
- WHEN the page renders
- THEN breadcrumb (`Dashboard / Ingresos`), `PeriodoSelector`, `3 ingresos`, `+$1.500.000`, and the
  "Sin meta ni semáforo" note are all present

#### Scenario: T2 tablet header geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the page renders
- THEN the header matches the wireframe T2 variant, asserted by rendered geometry — never by className
  presence alone (the `WCTG-14`/`WG5-10` gap)

### Requirement: WDI-02 — Semantic `<table>` with Fecha / Descripción / Origen / Monto (CA-02)

The transaction list MUST render as a semantic `<table>` — the first in the web app — with columns Fecha,
Descripción, Origen, Monto. Every column header MUST be a `<th>` with `scope`, and the table MUST carry an
accessible name (caption or `aria-label`). Each row MUST render: the date via `aFechaCorta` (a new pure
helper in `domain/fecha.ts` — the 4th `.slice(0, 10)` occurrence, DRY rule of 3; the 3 legacy slice sites
migrate later, out of scope), the description verbatim, Origen as a tag showing the bank name verbatim or
`Manual` (MID-02), and Monto via `formatearMontoConSigno(monto, '+')` (positive, MID-05). Row order MUST be
the payload's order verbatim — the client MUST NOT re-sort (MID-01 authoritative).

#### Scenario: The table renders all four columns with the Origen tag and signed Monto (jsdom)

- GIVEN a payload with rows from BCI and a Manual row
- WHEN the page renders
- THEN each row shows its `aFechaCorta` date, the description verbatim, an Origen tag (`BCI`, `Manual`),
  and a `+`-signed Monto

#### Scenario: The list is a real table with scoped headers and an accessible name (jsdom)

- GIVEN the rendered page
- WHEN the accessible tree is inspected
- THEN a `table` role is present with `<th scope>` headers for Fecha, Descripción, Origen, Monto and an
  accessible name

#### Scenario: Rendered row order matches the payload verbatim (jsdom)

- GIVEN a payload whose rows arrive day-3 first, then day-15 in `id` asc order
- WHEN the page renders
- THEN the rendered order is identical — no client-side re-sort

### Requirement: WDI-03 — In-page month navigation and deep-linkable `periodo` (CA-03)

The page's `PeriodoSelector` MUST change the viewed month in-page (prev/next/"Hoy" per WPER-02/03/04),
updating the URL `periodo` search param with no reload and no parallel state source (WPER-05) via a
functional search updater (US-053 D-04). The page MUST never leave `/ingresos`. Arriving with
`?periodo=YYYY-MM` MUST render that month's data; absent `periodo` resolves to the current month (MID-04).
Navigation MUST remain available on an empty month (WDI-04).

#### Scenario: Arrows change the month in-page and update the URL (jsdom)

- GIVEN `/ingresos?periodo=2026-07` renders
- WHEN the user activates prev
- THEN the URL `periodo` becomes `2026-06`, the page stays on `/ingresos`, and it refetches and renders
  June data

#### Scenario: A deep link honours `periodo`; absent `periodo` defaults to the current month (jsdom)

- GIVEN a deep link `/ingresos?periodo=2026-03`
- WHEN the page loads
- THEN it renders March 2026 data
- AND `/ingresos` with no `periodo` renders the current calendar month (MID-04)

### Requirement: WDI-04 — Explicit empty-month state (decision 4)

WHEN the viewed month has zero income rows (MID-01: 200, `total` `"0"`, `conteo` 0, `transacciones` `[]`),
the page MUST render the header (zeroed total as `$0` — `formatearMontoConSigno`'s zero rule renders no
sign prefix — plus `0 ingresos`) AND `Empty` with the custom copy `Sin ingresos en {mes}`, with
`PeriodoSelector` navigation preserved. The dashboard's `sinIngreso` branch MUST NOT render here — the wire
has no such flag; an empty income month is a success, not an error.

#### Scenario: An empty income month renders zeros, the copy, and live navigation (jsdom)

- GIVEN `conteo: 0`, `total: "0"`, `transacciones: []` for `2026-07`
- WHEN `/ingresos?periodo=2026-07` renders
- THEN the header shows `$0` and `0 ingresos`, `Sin ingresos en julio 2026` renders, no table rows render,
  and the month arrows remain operable

### Requirement: WDI-05 — Loading, error, and retry states (CA-05)

The page MUST render the app's existing loading state while `useIngresosMes` (queryKey
`['ingresos-mes', periodo ?? 'actual']`) is pending, and MUST render the existing error state with a retry
control when the query fails — network error, 401, or a response body rejected by the `esIngresosMesDto`
guard (`esMontoStringValido` + `esFechaValida`, WAC-02's fail-closed precedent).

#### Scenario: A failed query renders the error state with retry (jsdom)

- GIVEN `useIngresosMes` resolves to an error (e.g. `tag: 'network'`)
- WHEN the page renders
- THEN the existing error state renders with a retry control that refetches on activation

### Requirement: WDI-06 — Thin client: labels only, typed route, no income mutation surface (CA-05, ADR-024)

The page MUST NOT perform business logic beyond labels and formatting: the view-model
(`ingresos-mes-view-model.ts`) MUST be a pure passthrough mapping the DTO to display values (`aFechaCorta`,
Origen tag text, `formatearMontoCLP`/`formatearMontoConSigno`) — no re-sort, no totals recomputation, no
classification logic (ADR-024; the WG5-11/WDM-08 boundary). The DTO MUST be re-exported per ADR-008 with
the `esIngresosMesDto` runtime guard, and the route MUST be typed (`validateSearch` via `normalizarPeriodo`).
The page MUST NOT offer edit or reclassify of incomes (out of scope; no catalog prefetch is needed).

#### Scenario: The view-model only labels; order is the wire's (jsdom)

- GIVEN the page's view-model and source
- WHEN they are inspected
- THEN the only derivations are display labels/formatting, the row order passes through verbatim, and no
  re-sort or totals recomputation exists

#### Scenario: No edit or reclassify affordance exists on the page (jsdom)

- GIVEN the rendered page
- WHEN its interactive elements are enumerated
- THEN the only interactive controls are the period navigation, the breadcrumb/back link, and retry — no
  per-row edit/reclassify control

### Requirement: WDI-07 — a11y: the first semantic table exposes a proper accessible contract; new files join the scoped lint gate (CA-05, ADR-018)

The new files (`IngresosMesPage.tsx`, `IngresosMesTable.tsx`, `routes/_authenticated/ingresos.tsx`) MUST be
added to the existing scoped `eslint-jsx-a11y` `error`-severity override (the WCFG-12/WCTG-12/WG5-12
precedent). The table MUST expose an accessible name (caption or `aria-label`), real `<th scope>` headers,
and rows addressable by role — asserted by unit tests via testing-library role/name queries (repo precedent,
D-09; `vitest-axe` is not a dependency). The table and `PeriodoSelector` MUST remain keyboard-operable with
a visible focus ring (WCAG 2.2 AA, ADR-018). The T2 tablet table geometry MUST be asserted by rendered
geometry at a real viewport (WG5-10), never by className presence alone.

#### Scenario: The scoped lint gate is clean (jsdom)

- GIVEN the new Ingresos page files
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: The table exposes a correct accessible contract (jsdom)

- GIVEN the rendered table with rows
- WHEN testing-library queries it by role and accessible name
- THEN it resolves the table via its accessible name, every column header has a `scope`, and each row is
  addressable by its role (repo precedent, D-09 — no `vitest-axe` dependency)

#### Scenario: T2 tablet table geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the table renders
- THEN the columns and Origen tags match the wireframe T2 variant, asserted by rendered geometry — never
  by className presence alone

### Requirement: WDI-08 — e2e: ingresos-mes flows run against the dedicated stub (verification-only)

*(Verification-only. `ingresos-mes.e2e.ts` MUST cover: legend arrival (CA-04), in-page month navigation
with URL updates (CA-03), and the empty month (decision 4). The `**/api/ingresos/mes*` stub's prefix is
distinct from `**/api/resumen*`, so no LIFO collision exists between the two stub families — but fixture
registration order MUST still keep the specific ingresos stub registered after any broader dashboard stubs
in the same test, so the more specific match always wins.)*

#### Scenario: The ingresos stub wins over any broader dashboard stub (Playwright/e2e)

- GIVEN a test registering both `**/api/ingresos/mes*` and a broader dashboard stub
- WHEN the test exercises `/ingresos`
- THEN the ingresos stub serves the response — fixture order keeps the specific stub registered after the
  broad one

## Web Tabla Anual — Annual grid (`ResumenAnual`)

Source: `openspec/changes/us-048-web-tabla-anual/proposal.md` (US-048, issue #282). New requirements use
fresh family **`WTA-*`** (Web Tabla Anual) — the annual grid (`ResumenAnual`) has no requirements of its
own today. `WTA-*` REFERENCES, never restates, the families below.

Labels: **(jsdom)** = DOM/text/accessible-name/pure-function truth, verifiable by Vitest/jsdom.
**(Playwright)** = truth depends on rendered geometry at a real viewport; jsdom cannot verify it.

| Referenced | Governs |
|---|---|
| `WG5-01`/`WG5-13` | 4-item ring apportionment; Sin categoría dilutes the 3 spend shares |
| `WG5-07`/`WG5-08` | Semáforo tag is a navigable link; `null` estado → "Sin datos", still live |
| `WSEM-01..08` | `/semaforo` detail page (US-049, issue #283) |
| `WG5-10` | Rendered-geometry verification, never className presence alone |
| `WPER-*`/`WMYP-*` | Period-navigation plumbing (reused unchanged) |
| `WDS-04` | Capability `web-dashboard-shell`, defined only in the **un-archived** change `openspec/changes/web-dashboard-redesign-mobile/specs/web-dashboard-shell/spec.md` — its own verify-report records this grid's `2/3/4`-column layout as an **accepted-but-unratified deviation** (⚠️ PARTIAL/SUGGESTION), not a locked living requirement. What IS locked and green is the code-level `ResumenAnual.test.tsx` grid-columns test; this change does not re-litigate that test |

### Requirement: WTA-01 — Each mini renders the same 4-item ring reading as the main chart, apportioned over its own month's totals (CA-01)

Every month cell's mini ring MUST call `calcularDistribucionGasto` with no bucket-set override, yielding the
`WG5-01` 4-wedge reading (Necesidades, Deseos, Ahorro, Sin categoría) apportioned from THAT month's own
`buckets` totals (`WG5-13` dilution applies per-mini). The `BUCKETS_5030` override and its interim comment
MUST NOT exist after this change.

#### Scenario: A mini renders 4 wedges from its own month's totals (jsdom)

- GIVEN 12 months of `buckets` data, one with a nonzero Sin categoría total
- WHEN the grid renders
- THEN every mini shows 4 wedges in fixed order, proportioned from that month's own totals

#### Scenario: No 3-slice override remains (jsdom)

- GIVEN the grid's source
- WHEN a mini's ring data is computed
- THEN `calcularDistribucionGasto` is called with no bucket-set override argument

### Requirement: WTA-02 — The month driving the main chart is a distinct "selected" marker, coexisting with the pre-existing "today" marker (CA-02, D-1)

The cell whose `periodo` equals `viewModel.periodo` (prop-derived, never locally tracked clicks) MUST render
a distinct "selected" marker (larger, accent-filled), separate from the pre-existing "today" marker (`✓` +
`aria-current="date"`, keyed to the real calendar month only). Both MUST render simultaneously when they
differ; `aria-current` MUST stay reserved for today and MUST NOT be repurposed for "selected".

#### Scenario: Viewing a month other than today shows both markers on their own cells (jsdom)

- GIVEN the viewed period is March and today is August
- WHEN the grid renders
- THEN March shows the selected marker only; August shows `✓`/`aria-current="date"` only

#### Scenario: Viewing today's month shows both markers on the same cell (jsdom)

- GIVEN the viewed period equals the current calendar month
- WHEN the grid renders
- THEN that cell shows both the selected marker and `✓`/`aria-current="date"` together

### Requirement: WTA-03 — Existing data-month navigation survives the DOM restructure (regression, CA-03)

*(Verification-only. `MesCelda` click → `onSelectPeriodo` → `WPER-*`/`WMYP-*` plumbing already switches the
main chart, no reload, preserving drill-down via the URL-param period state; the US-047 bucket-selection
reset is retired with the panel (WDM-06). This change restructures `MesCelda`'s DOM
(`WTA-05`); this requirement pins that behavior against regression — no wiring is rebuilt.)*

A data-month click/keyboard-activation MUST switch the viewed period and re-render the main chart with no
reload, preserving existing drill-down (now navigation per `WCAT-01`); there is no bucket-selection state
to reset (panel retired, `WDM-06`).
(Previously: the requirement preserved "existing drill-down and bucket-selection reset"; the selection
state was retired with the US-047 panel.)

#### Scenario: Clicking a data month switches the main chart without reload (jsdom)

- GIVEN a month cell with data, not selected
- WHEN the user clicks or keyboard-activates it
- THEN the main chart re-renders for that month via the URL period param, no reload, with no selection
  state to clear (`WDM-06`)

### Requirement: WTA-04 — Existing disabled-cell semantics survive the DOM restructure (regression, CA-04)

*(Verification-only. `sinIngreso` cells already render `aria-disabled`, no `tabIndex`/`onClick`. This change
restructures `MesCelda`'s DOM (`WTA-05`); this requirement pins that behavior against regression — no
behavior is rebuilt.)*

An empty/future cell MUST stay visually muted, `aria-disabled="true"`, and non-responsive to click/keyboard.

#### Scenario: An empty/future cell stays non-navigable (jsdom)

- GIVEN a month cell with no data
- WHEN the user clicks it or tabs to it and presses Enter/Space
- THEN no navigation occurs, `aria-disabled="true"` is present, and it is excluded from Tab order

### Requirement: WTA-05 — Every month carries an independently clickable semáforo tag, including empty/future months (CA-05, D-2, D-3, D-4)

Each cell MUST carry a compact semáforo tag, top-right, navigating to `/semaforo?periodo={mes.periodo}` on
click/keyboard — the `WG5-07` transversal rule applied here. It MUST render and stay navigable for EVERY
month, including empty/future ones (`WTA-04`'s disabled state governs only the month control) and for a
`null` `estadoGlobal` (`WG5-08`'s "Sin datos", still a live link). Its accessible name MUST identify the
month. The month control and the tag MUST be SIBLING interactive elements — never nested — with a stated
tab order. Its rendered hit area MUST be ≥24×24 CSS px, verified by rendered geometry at a real viewport
(`WG5-10`), never by className presence — the exact anti-pattern that shipped `WCTG-14` false.

#### Scenario: An empty/future month's tag stays clickable while the cell stays disabled (jsdom)

- GIVEN a future cell with `estadoGlobal: null`
- WHEN the grid renders
- THEN the month control is `aria-disabled`; that cell's tag shows "Sin datos" and navigates on activation

#### Scenario: The month control and the tag are siblings, never nested (jsdom)

- GIVEN any rendered cell
- WHEN the accessible tree is inspected
- THEN the month button and the semáforo link are independent elements, each separately Tab-reachable

#### Scenario: The tag's rendered hit area meets the 24×24 CSS px floor at a real viewport (Playwright, anti-pattern named)

- GIVEN a cell's semáforo tag at a representative viewport
- WHEN its bounding box is measured
- THEN width and height are each ≥24 CSS px, asserted against rendered geometry — never a sizing className
  alone, the `WCTG-14` gap

### Requirement: WTA-06 — Section header and caption carry the approved literal Spanish copy, the caption naming the actually selected month (CA-06)

The section header (`<h2>`, also the region's accessible name) MUST render the literal text
`Año {anio} — vista macro por mes` (e.g. `Año 2026 — vista macro por mes`).

The grid MUST render a caption below it, associated with the section, using the literal template `Toca un
mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo {mes año}.` —
the `{mes año}` fragment MUST be derived from `viewModel.periodo` (the CURRENTLY selected month), never
hardcoded.

#### Scenario: The section header renders the approved literal (jsdom)

- GIVEN the grid is rendered for `anio = 2026`
- WHEN the header renders
- THEN it reads exactly `Año 2026 — vista macro por mes`

#### Scenario: The caption names the actually selected month (jsdom)

- GIVEN the viewed period is `2026-03`
- WHEN the caption renders
- THEN it reads exactly `Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de
  siempre. Estás viendo marzo 2026.` and updates when the viewed period changes

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

### Requirement: WAC-01 — DTO Types Are Derived, Not Hand-Written

For every endpoint covered by `apps/api/openapi.json` (see `api-client` spec), `apps/web/src/api/types.ts`
MUST declare its DTO shapes as type aliases over `@moneydiary/api-client`'s generated
`components['schemas'][...]` types, not as independently hand-written `interface` declarations. The file
MUST hold zero hand-written interface bodies for those covered endpoints; existing documentation comments
(explaining the money/date representation) MAY remain.

#### Scenario: No hand-written interface remains for a covered DTO

- GIVEN `ResumenMesDto` is covered by `apps/api/openapi.json`
- WHEN `apps/web/src/api/types.ts` is inspected after migration
- THEN `ResumenMesDto` is declared as a type alias over `@moneydiary/api-client`'s generated
  `components['schemas']['ResumenMesDto']` (or equivalent), not as a hand-written `interface` body

#### Scenario: Web typecheck passes using the derived types

- GIVEN `apps/web/src/api/types.ts` has been migrated for all endpoints covered by the contract
- WHEN `pnpm web typecheck` runs
- THEN it passes with zero type errors attributable to the migration

### Requirement: WAC-02 — Runtime Guards and Error Handling Are Unchanged

Every runtime type guard (`esMontoStringValido`, `esFechaValida`, `esResumenMesDto`, and each per-DTO
shape guard in `apps/web/src/api/client.ts`), the `ApiError` discriminated union, and every `fetch`
wrapper function MUST remain behaviorally identical after this migration. Only the type declarations these
guards check against may change (from hand-written to generated); the guard implementations, their control
flow, and the `ApiError` tag set (`invalid | unauthorized | network | parse | server`) MUST NOT be edited.

#### Scenario: A guard-behavior test still passes unchanged

- GIVEN an existing unit test asserting `esMontoStringValido` rejects a non-numeric string and
  `esResumenMesDto` rejects a payload missing `totalIngreso`
- WHEN that test runs after the type-source migration, with no edits to the test itself
- THEN it passes exactly as it did before the migration

#### Scenario: Money-bearing response fields still type-check as `string`

- GIVEN the generated type for `cargo`/`abono`/`total`/`totalIngreso` is `string` (see `api-client` spec
  AC-04)
- WHEN `apps/web/src/api/types.ts` aliases these fields
- THEN the resulting DTO types in `apps/web` still type these fields as `string`, matching what the
  runtime guards already validate

#### Scenario: `ApiError` taxonomy is untouched

- GIVEN the current `ApiError` union has five tags (`invalid | unauthorized | network | parse | server`)
- WHEN the migration diff is inspected
- THEN no edit touches the `ApiError` type definition, its tags, or the functions that construct each
  variant

### Requirement: WCFG-01 — Route is session-protected and reachable from two entry points (CA-01)

`/configuracion` and all of its nested routes (`/configuracion/categorias`,
`/configuracion/categorias/:categoriaId`) MUST render only inside the `_authenticated` layout's existing
session guard, with no new guard code — the `configuracion` layout route MUST NOT introduce a second
guard; nested routes inherit protection from the shared `_authenticated` ancestor. `/configuracion` MUST
be reachable both from the `Configuración` nav item (`NAV_ITEMS`, shared by
`Sidebar`/`BottomTabs`) and from an icon link in the sidebar footer (`aria-label="Configuración de la
cuenta"`, no user name rendered).
(Previously: scoped to the single `/configuracion` route only; now also covers the nested Categorías
routes introduced by the layout restructure, WCTG-01/§1.)

#### Scenario: Unauthenticated visit redirects to login

- GIVEN no active session
- WHEN the browser navigates to `/configuracion`
- THEN it redirects to `/login?redirect=/configuracion`

#### Scenario: Both entry points reach the page

- GIVEN an authenticated session
- WHEN the user activates the `Configuración` nav item, or the sidebar-footer icon link
- THEN both navigate to `/configuracion`

#### Scenario: A nested categorías route is protected without its own guard code

- GIVEN no active session
- WHEN the browser navigates directly to `/configuracion/categorias/abc123`
- THEN it redirects to `/login?redirect=/configuracion/categorias/abc123`, via the same `_authenticated`
  guard the layout route uses — no second guard was written

### Requirement: WCFG-02 — Perfil layout matches the verbatim visual contract (CA-02)

The Perfil screen MUST render, in order: the shared `Configuración` `<h1>` owned by the layout route; a
vertical section-tab list whose `Perfil` entry carries `aria-current="page"` and whose `Categorías`
entry is a **real, active `<Link>`** to `/configuracion/categorias`; the panel's own `Editar perfil`
heading, one level below the shared `<h1>`; three divided blocks — `Nombre`/`Email`, `Cambiar password`
(`Password actual`/`Password nueva`), `Cuenta de Google` — followed by one right-aligned `Guardar
cambios` button. The Google block MUST render exactly one of two structurally symmetric states, driven
by `me.googleVinculado`.

(Previously: the page's FIRST heading was `Editar perfil`, and the `Categorías` tab was a **placeholder,
inert**, given "the same treatment as `NAV_ITEMS`' unfinished destinations". The layout restructure of
WCTG-01/§1 moves the `Configuración` heading up into the shared layout — demoting `Editar perfil` one
level into the panel — and US-043 is precisely the change that makes the `Categorías` destination real,
so the inert-placeholder clause is retired. **Both departures are deliberate; this delta is what
authorises them.** Everything below the tab list — the three blocks, the button, and the Google block's
two states — is unchanged from the shipped requirement.)

#### Scenario: The shared heading precedes the panel heading

- GIVEN an authenticated session on `/configuracion`
- WHEN the page renders
- THEN the `Configuración` heading is the page's top-level heading and `Editar perfil` is a heading one
  level below it, inside the routed panel — not the first heading on the page

#### Scenario: The Categorías tab is no longer inert

- GIVEN an authenticated session on `/configuracion`
- WHEN the user activates the `Categorías` tab
- THEN it navigates to `/configuracion/categorias` — it is a real `<Link>`, never a disabled control,
  and it MUST NOT carry `aria-disabled`

#### Scenario: Everything below the tab list is unchanged

- GIVEN an authenticated session on `/configuracion`
- WHEN the page renders
- THEN the three divided blocks appear in the shipped order, followed by one right-aligned `Guardar
  cambios` button, and the Google block renders exactly one of its two symmetric states per
  `me.googleVinculado`

#### Scenario: Linked state renders the green pill and Desvincular

- GIVEN `me.googleVinculado` is `true`
- WHEN the Cuenta de Google block renders
- THEN it shows the pill `Vinculada: {me.email}` and a `Desvincular` button, not `Vincular con Google`

#### Scenario: Not-linked state renders the neutral pill and Vincular

- GIVEN `me.googleVinculado` is `false`
- WHEN the Cuenta de Google block renders
- THEN it shows a neutral `No vinculada` pill and a `Vincular con Google` button, in the same layout
  position `Desvincular` would occupy

### Requirement: WCFG-03 — Identity is fetched once per visit and invalidated after mutation

`useMe()` (query key `['auth-me']`) MUST NOT issue a network request when the route guard's
`beforeLoad` has already primed the cache for the same visit. `GET /api/auth/me` MUST be requested
exactly once when landing on `/configuracion`.

A mutation MUST invalidate `['auth-me']` exactly when it changed a field the endpoint reports **and**
the client remains on the page to observe it. Concretely: a successful **profile** save and a
successful **unlink** MUST invalidate. A **password-only** success MUST NOT — no `MeDto` field
changed, so a refetch would cost a round trip to re-read identical data. A **link** MUST NOT — it
hands off to Google through a full-page navigation, so the cache is discarded and `beforeLoad`
re-primes on return; invalidating would spend a request the navigation already makes. A **failed**
mutation MUST NOT invalidate, except that a partial failure whose profile half succeeded MUST.

#### Scenario: Exactly one fetch on landing

- GIVEN an authenticated session
- WHEN the user navigates to `/configuracion`
- THEN `GET /api/auth/me` is called exactly once (by `beforeLoad`), not a second time by `useMe()`

#### Scenario: A successful profile save invalidates identity

- GIVEN the profile save succeeds
- WHEN the mutation resolves
- THEN `['auth-me']` is invalidated and any component reading `useMe()` re-renders with fresh data

#### Scenario: A password-only success does not invalidate identity

- GIVEN only the password fields changed and the password call succeeds
- WHEN the mutation resolves
- THEN `['auth-me']` is NOT invalidated, because no field the endpoint reports has changed

#### Scenario: Unlink invalidates identity, link does not

- GIVEN the user confirms `Desvincular` and the request succeeds
- THEN `['auth-me']` is invalidated, because `googleVinculado` flipped
- GIVEN the user confirms `Vincular con Google` and the authorisation URL is returned
- THEN `['auth-me']` is NOT invalidated, because the client is leaving for Google and `beforeLoad`
  re-primes identity when the callback returns

### Requirement: WCFG-04 — `esMeDto` rejects a payload missing or mistyping `nombre`/`googleVinculado`

`apps/web/src/api/auth.ts`'s `esMeDto` guard MUST additionally validate that `nombre` is a `string` and
`googleVinculado` is a `boolean`, on top of its existing `userId`/`esDemo`/email-invariant checks, and
MUST return `{ tag: 'parse' }` (never a defaulted value) when either is missing or mistyped.

#### Scenario: Missing or mistyped required field is rejected

- GIVEN a `GET /api/auth/me` payload missing `nombre`, missing `googleVinculado`, or where either has
  the wrong type
- WHEN `esMeDto` validates it
- THEN it returns `false` and `fetchMe()` resolves to `{ tag: 'parse' }`

#### Scenario: A valid payload with both fields is accepted

- GIVEN a payload carrying valid `nombre: string` and `googleVinculado: boolean` alongside the existing
  fields
- WHEN `esMeDto` validates it
- THEN it returns `true`

#### Scenario: The hardening's app-wide consequence is fail-closed by design

- GIVEN the API ever stops sending `nombre` or `googleVinculado` on `/api/auth/me`
- WHEN `requireSession` calls `fetchMe` during any authenticated route's `beforeLoad`
- THEN the resulting `{ tag: 'parse' }` is treated as a non-ok result and every authenticated route
  redirects to `/login` — an accepted, documented risk, not a bug

### Requirement: WCFG-05 — `Guardar cambios` diffs the form and calls only what changed

One `Guardar cambios` control MUST send `PATCH /api/perfil` only if `nombre` and/or `email` changed
from `me`, and `PATCH /api/perfil/password` only if `Password nueva` is non-empty. If neither changed,
no request MUST be sent and `"No hay cambios para guardar."` MUST be shown.

#### Scenario: Only the password changed sends a single call

- GIVEN `Nombre`/`Email` are unchanged and `Password nueva` has a value
- WHEN `Guardar cambios` is activated
- THEN only `PATCH /api/perfil/password` is called

#### Scenario: Nothing changed makes no request

- GIVEN no field is dirty and `Password nueva` is empty
- WHEN `Guardar cambios` is activated
- THEN no request is sent and `"No hay cambios para guardar."` is shown

### Requirement: WCFG-06 — Profile call precedes the password call, and its failure aborts the sequence

WHEN both `nombre`/`email` and `Password nueva` changed, `PATCH /api/perfil` MUST be sent and MUST
resolve before `PATCH /api/perfil/password` is sent. `PATCH /api/perfil/password` MUST NOT be called if
`PATCH /api/perfil` fails, for any reason.

#### Scenario: Both changed — profile call precedes and gates the password call

- GIVEN `Email` changed and `Password nueva` has a value, both with a correct `Password actual`
- WHEN `Guardar cambios` is activated
- THEN `PATCH /api/perfil` is called and resolves before `PATCH /api/perfil/password` is called

#### Scenario: A taken email with a correct password aborts the password call and protects the account

- GIVEN `Email` is changed to an address already owned by another user, `Password nueva` also has a
  value, and `Password actual` is the user's own correct password
- WHEN `Guardar cambios` is activated
- THEN `PATCH /api/perfil` returns `403 PERFIL_RECHAZADO`
- AND `PATCH /api/perfil/password` is never called
- AND the user's password is not rotated and no other session is revoked (this is the case a reversed
  order or a missing abort would silently break)

### Requirement: WCFG-07 — Partial failure (profile saved, password failed) leaves a specified state

WHEN the profile call succeeds and the subsequent password call fails, the UI MUST show
`"Se guardaron tus datos, pero no se pudo cambiar la password."` followed by the specific password
error, MUST re-derive `Nombre`/`Email` from the refreshed `useMe()` (no longer dirty), and MUST retain
`Password actual`/`Password nueva` uncleared so the next submit sends only `PATCH /api/perfil/password`.

#### Scenario: Partial failure preserves password inputs and narrows the retry

- GIVEN the profile call succeeded and the password call then failed
- WHEN the failure state renders
- THEN `Nombre`/`Email` show the saved values, `Password actual`/`Password nueva` still hold what the
  user typed, and the next `Guardar cambios` click sends only `PATCH /api/perfil/password`

### Requirement: WCFG-08 — `Password actual` is the single authorisation input

`Password actual` MUST be required, and block submission client-side, whenever `Email` differs from
`me.email`. `Vincular con Google` and `Desvincular` MUST each open a `role="alertdialog"` confirmation
requesting `Password actual` before sending their request.

#### Scenario: Editing email without a password blocks submission

- GIVEN `Email` was changed and `Password actual` is empty
- WHEN the user activates `Guardar cambios`
- THEN no request is sent and the empty field is flagged

#### Scenario: Link and unlink dialogs require the password before confirming

- GIVEN either dialog is open
- WHEN the user attempts to confirm with `Password actual` empty
- THEN the confirm action is blocked until a value is entered

### Requirement: WCFG-09 — Error and success copy is a closed, verbatim table (CA-03)

| Outcome | Verbatim copy | Region |
|---|---|---|
| Saved, no password change | `Cambios guardados.` | `aria-live="polite"` |
| Saved, password changed | `Cambios guardados. Se cerraron tus otras sesiones.` | `aria-live="polite"` |
| Profile saved, password failed | `Se guardaron tus datos, pero no se pudo cambiar la password.` | `role="alert"` |
| `403 PERFIL_RECHAZADO` on profile | `No se pudieron guardar los cambios. Revisa tu password actual y el email.` | `role="alert"` |
| `403 PERFIL_RECHAZADO` on password | `No se pudo cambiar la password. Revisa tu password actual.` | `role="alert"` |
| `400` on `nombre` | `El nombre debe tener entre 1 y 80 caracteres.` | `role="alert"` |
| `400` on `passwordNueva` | `La password nueva no cumple los requisitos mínimos.` | `role="alert"` |
| `403 DEMO_SOLO_LECTURA` | `Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.` | `role="alert"` |
| `tag: 'network'` | `No se pudo conectar con el servidor.` | `role="alert"` |
| Any other non-2xx | `Ocurrió un error inesperado. Intenta nuevamente.` | `role="alert"` |
| `tag: 'unauthorized'` | (no message) `navigate({ to: '/login' })` | — |

No row MUST render a server-supplied string or a message more specific than this table, even when the
underlying `403 PERFIL_RECHAZADO` cause is a wrong password vs. a taken email.

#### Scenario: A taken email and a wrong password render the identical generic copy

- GIVEN two separate `403 PERFIL_RECHAZADO` responses, one caused by a taken email and one by a wrong
  `passwordActual`
- WHEN each is mapped to UI copy
- THEN both render the exact same string from this table, with no cause named

#### Scenario: Demo session shows the register-guidance copy

- GIVEN a demo session forces a mutation to run
- WHEN `403 DEMO_SOLO_LECTURA` returns
- THEN the exact demo copy row above is shown

### Requirement: WCFG-10 — The `?google=` return contract is validated, single-surfaced, and cleans the URL

`validateSearch` MUST narrow `google` to the literal union `'vinculado' | 'error'`, dropping any other
value to `undefined`. On mount the route MUST read it once into local state, then
`navigate({ to: '/configuracion', search: {}, replace: true })`. The rendered message MUST survive that
URL rewrite and MUST NOT reappear on refresh or back navigation. No refetch beyond the one already
primed by `beforeLoad` is required.

#### Scenario: `vinculado` and `error` each render their own message once

- GIVEN the route is loaded with `?google=vinculado`
- WHEN the page mounts
- THEN `Vinculaste tu cuenta de Google.` renders once and the URL becomes `/configuracion`
- GIVEN `?google=error` instead
- THEN `No se pudo vincular tu cuenta de Google. Intenta nuevamente.` renders once

#### Scenario: An unknown value renders nothing, and the message does not reappear on refresh

- GIVEN `?google=unknown-value`
- WHEN the page mounts
- THEN no Google-return message renders
- GIVEN a valid value already rendered its message and cleaned the URL
- WHEN the page is refreshed or the user navigates back
- THEN the message does not reappear

### Requirement: WCFG-11 — CA-04 fluid layout reproduces T1 at the `md` breakpoint (boundary moved from `lg`, US-063 D-1/D-2)

The shared `configuracion` layout's grid (heading + tab list beside the routed panel) MUST be fluid (a
fixed-width first column plus a flexible panel) and MUST render **that kind of layout** at T1's viewport
width, without adding any constant to `layout.ts` or changing `AppShell`/`Sidebar`/`BottomTabs`.

**The claim is kind-level, not pixel-level, and that is a repair — not a loosening.** The superseded
wording said "MUST reproduce T1's **measured proportions**". That was never literally true and never
could be: the frames draw the tab column at **113px** (`wireframes-extracted.md` §1, §3) while
`ConfiguracionLayout` ships **200px** (`lg:grid-cols-[200px_1fr]`), a deliberate US-042 choice nobody
has asked to revisit. Left as written, this change would be required to author a test asserting 113px —
a test that cannot pass against intended code. What the requirement actually protects is the *shape*
(fixed column beside fluid panel), and that is what it now says. Any future change wanting the frames'
exact 113px must say so as its own decision, against the code, not inherit it by implication here.
Below `md` (768px) — not `lg` — the layout's two columns MUST stack (heading + tab list above the routed
panel). This grid is shared chrome and MUST apply identically to whichever child route (`/configuracion`
Perfil or `/configuracion/categorias` list) renders inside it. The edit route
(`/configuracion/categorias/:categoriaId`) opts out of this chrome per WCTG-01 and is governed by WCTG-14
instead.
(Previously: the two-column boundary was `lg` (1024px). By the same arithmetic that shipped `WCTG-14`
false, this requirement's own first scenario was ALSO unverified and, on the evidence, false as shipped:
T1's measured width is 880px, which is below `lg` (1024px), so the grid this requirement governs would have
fallen back to `grid-cols-1` at T1's own width — the stacked layout, not the fixed-sidebar/fluid-content
layout the scenario claims. This repair moves the boundary to `md` (768px), where 880 ≥ 768 holds, and
scenario 1 becomes true. "No new entry in `layout.ts`" is preserved for the same reason as WCTG-14: `md` is
a stock Tailwind literal-class boundary, not a config constant. This is the same grid `WCTG-14` reuses, so
this repair and `WCTG-14`'s repair are the same fix applied once.)

#### Scenario: T1 width reproduces the measured proportions (repaired)

- GIVEN the viewport is at T1's width (880px)
- WHEN the layout renders (Perfil or the Categorías list inside it)
- THEN the sidebar width/font are unchanged and the layout's own gutter/panel measurements match T1 — with
  a fixed-width column and a fluid column, because 880px is ≥ `md` (768px), and with no new entry in
  `layout.ts`

#### Scenario: Below `md` the columns stack

- GIVEN the viewport is below `md` (768px)
- WHEN the layout renders
- THEN the heading and tab list appear above the routed panel instead of beside it

#### Scenario: The edit route does not inherit this grid

- GIVEN the user is on `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN it does not render the shared tab-list grid; the back-icon chrome (WCTG-01/WCTG-14/WCTM-04) renders
  instead

### Requirement: WCFG-12 — Configuración inputs satisfy CA-05 a11y and the scoped lint gate

`eslint-plugin-jsx-a11y` MUST be installed and enabled at `error` severity via a path override scoped to
`src/components/configuracion/**` and every `src/routes/_authenticated/configuracion*.tsx` route file
this change introduces or modifies (`warn` elsewhere). Every form input on any Configuración page MUST
have an associated `<label>` reachable via `getByLabelText`.
(Previously: the route-file portion of the glob covered only the single `configuracion.tsx` file; it now
covers every route file the layout restructure and the new Categorías routes introduce, §12.)

#### Scenario: Every input is reachable by its label

- GIVEN the rendered Perfil form
- WHEN each input is queried by `getByLabelText` with its verbatim label (`Nombre`, `Email`, `Password
  actual`, `Password nueva`)
- THEN each query resolves to exactly one input

#### Scenario: The scoped lint gate is clean

- GIVEN the new files under `src/components/configuracion/**` and every new/modified `configuracion*.tsx`
  route file
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: New route files are covered by the widened glob

- GIVEN the new Categorías route files exist alongside the original `configuracion.tsx`
- WHEN `pnpm web lint` runs
- THEN the `error` tier applies to those new files too, not only the original single file

### Requirement: WCFG-13 — Both mandatory gates must be green

`pnpm web typecheck` and `pnpm web test` MUST both pass. A green `pnpm web test` alone MUST NOT be
treated as sufficient, since it does not perform type-checking and cannot catch a `tsr generate`/`tsc`
failure from the new route file.

#### Scenario: Both gates pass before the change is considered done

- GIVEN the implementation is complete
- WHEN `pnpm web typecheck` and `pnpm web test` are run
- THEN both exit successfully

## Non-Goals

- Bulk reclassify UI (one transaction at a time, per `categorias-api`).
- Mobile (`apps/mobile`) per-transaction categoría UI.
- The standalone `/buckets/:bucket` deep-link route's own layout beyond
  reusing the grouped-by-categoría rendering already required here.
- Any change to `apps/web/src/api/client.ts` fetch logic.
- Any change to `apps/web/src/api/auth.ts` session handling.
- Adopting a runtime HTTP client from the package.
- Endpoints not yet in `apps/api/openapi.json`.
- Mobile Configuración (US-044)
- Any `apps/api` change (both contracts already deployed)
- A header/top-bar redesign of `AppShell` (Wireframe header is illustrative chrome, not a spec)
- A new breakpoint tier in `layout.ts` (WCFG-11 reproduces T1 fluidly instead)
- Promoting `jsx-a11y` to `error` app-wide, `vitest-axe`/`@axe-core` (Recorded follow-up, not this change)
- Password recovery/reset, new-email verification (Deferred at the API level)
- A "confirm new password" field (Wireframe has two password inputs, not three)
