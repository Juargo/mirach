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

### Requirement: WCAT-02 — Panel groups the bucket's transactions by categoría, ordered without a hardcoded enum

Within the selected bucket's panel, transactions MUST be grouped by
`categoria` (from `categorias-api`'s DTO field). Each group header MUST show
the categoría name, its transaction count, and its exact subtotal (from
string/BigInt amounts, never `Number()`/`parseFloat()`). Rows with no
categoría (SinCategoria bucket, or an unmatched row) render under a
"Sin categoría" group. Group order MUST be data-driven —
alphabetical by categoría `nombre` — with the "Sin categoría" group always rendered last, regardless of
its count. The ordering MUST NOT read a static `ORDEN_CATEGORIAS` enum (retired by this change, §7); a
user-created or renamed categoría MUST sort correctly with no ordering-code change.
(Previously: group order was implicit, driven by the hardcoded `ORDEN_CATEGORIAS.indexOf` enum in
`domain/categoria.ts`; that enum is retired by this change, §7.)

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

#### Scenario: A newly created categoría sorts alphabetically with no code change

- GIVEN a user creates categoría "Zapatería" in Deseos alongside existing "Delivery" and "Streaming"
- WHEN the Deseos panel renders
- THEN groups appear alphabetically (`Delivery`, `Streaming`, `Zapatería`), with no ordering constant
  updated

#### Scenario: Sin categoría group always renders last

- GIVEN a bucket panel has both categorized and uncategorized transactions
- WHEN the panel renders
- THEN the "Sin categoría" group appears after every named categoría group, regardless of its count

### Requirement: WCAT-03 — Empty states are preserved

If the selected bucket has zero transactions this period, the panel MUST show
the existing empty state (not a broken/empty grouped list). If the whole
period has zero transactions, the existing period-empty state MUST still
render before any bucket is selected.

#### Scenario: A bucket with zero transactions this period shows the empty state

- GIVEN Ahorro has zero transactions this period
- WHEN the user clicks the Ahorro pie slice
- THEN the panel shows the existing "no movements" empty state

### Requirement: WCAT-04 — Reclassify control is active, data-driven, and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder: activating it MUST let the user
choose a categoría (offered as ALL of the caller's own categorías, grouped by bucket, sourced from
`useCategorias()` — the live query this change introduces — never a hardcoded list) and call the
`categorias-api` reclassify endpoint. `ReclasificarCategoriaControl` MUST derive the destination bucket
from the chosen categoría's own `bucket` field in the DTO, not a static name→bucket map. When the chosen
categoría's bucket differs from the transaction's current bucket, the control MUST show a confirmation
naming the exact money move (e.g. "Esto mueve $X de Deseos a Necesidades") before committing; same-bucket
reclassification MUST commit immediately without a confirmation step. On success, the panel's transaction
list AND the resumen (pie/traffic-light) MUST refresh to reflect the new categoría/bucket. The
SinCategoria "Clasificar" CTA MUST behave the same way via the same control. A categoría created,
renamed, or deleted through `/configuracion/categorias` MUST be reflected here with no code change
(`domain/categoria.ts`'s hardcoded exports are removed, §7).
(Previously: the dropdown and bucket-move logic were backed by `domain/categoria.ts`'s hardcoded
`ORDEN_CATEGORIAS`/`CATEGORIA_BUCKET`, which could offer a deleted categoría, omit a newly created one, or
misfire/skip the cross-bucket confirmation after a re-bucket, §7.)

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

#### Scenario: A just-created categoría is offered by the dropdown immediately

- GIVEN a user creates categoría "Mascotas" via `/configuracion/categorias`
- WHEN they return to the dashboard and open the reclassify control on any transaction
- THEN "Mascotas" appears in the dropdown, grouped under its bucket, via the existing `['categorias']`
  cache — no code change

#### Scenario: A deleted categoría is no longer offered

- GIVEN a user deletes categoría "Delivery" via `/configuracion/categorias`
- WHEN they return to the dashboard and open the reclassify control
- THEN "Delivery" no longer appears in the dropdown

#### Scenario: A re-bucketed categoría triggers the confirmation correctly

- GIVEN a user moves categoría "Supermercado" from Necesidades to Deseos via the edit screen
- WHEN they reclassify a Necesidades transaction to "Supermercado" on the dashboard
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
`['resumen']`, `['resumen-anual']`, `['detalle-bucket']` (no period/bucket segment appended). A pattern
mutation MUST NOT invalidate any of the three dashboard keys — this exclusion is deliberate (pattern CRUD
has zero effect on any persisted transaction) and MUST be its own asserted, testable behavior, not an
implied absence. After a successful delete from the edit screen, the user MUST be navigated back to the
list.

#### Scenario: A pattern mutation invalidates only the catalog

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['categorias']` is invalidated

#### Scenario: A pattern mutation does NOT invalidate the dashboard (the exclusion)

- GIVEN the same pattern mutation as above
- WHEN the mutation resolves
- THEN `['resumen']`, `['resumen-anual']`, and `['detalle-bucket']` are NOT invalidated — asserted
  explicitly, not inferred from their absence in a different test

#### Scenario: A category mutation invalidates the catalog and all three dashboard keys

- GIVEN a category is created, renamed, re-bucketed, or deleted
- WHEN the mutation resolves
- THEN `['categorias']`, `['resumen']`, `['resumen-anual']`, and `['detalle-bucket']` are all invalidated

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

### Requirement: WCTG-13 — Mobile viewport gets a defensive floor, not a redesign (decision 8, §J)

At a 360px viewport, both screens MUST guarantee: (a) no horizontal overflow/scroll; (b) `Nombre` and
`Bucket` render stacked, not side by side; (c) every interactive control (row actions, footer buttons,
tab links) has a touch target of at least 24×24 CSS px (WCAG 2.2 AA SC 2.5.8, ADR-018). The desktop
structure is otherwise preserved at this width — vertical tabs, two row icons, breadcrumb. The M2/M3
wireframe restructure (horizontal tabs, single row icon, back-icon IA replacing the breadcrumb, inverted
footer, shortened labels) is explicitly OUT OF SCOPE for this change and is owned by **US-063 (#332)**.

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

### Requirement: WCTG-14 — CA-06 tablet renders correctly with no new breakpoint tier (CA-06, §11)

T2 (list) and T3 (edit) MUST render correctly reusing WCFG-11's existing fluid `lg` grid — a fixed-width
sidebar/tab column beside a fluid content column — with NO new entry added to `layout.ts`. At tablet
width, `Nombre` and `Bucket` MUST stay side by side (unlike the mobile floor in WCTG-13), and pattern rows
shrink proportionally with the fluid column.

#### Scenario: Tablet width reuses the existing fluid grid, no new tier

- GIVEN the viewport is at T2/T3's measured width
- WHEN the list and edit screens render
- THEN the tab/sidebar column is fixed-width, the content column is fluid, and `layout.ts` gains no new
  breakpoint constant

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

### Requirement: WCFG-11 — CA-04 fluid layout reproduces T1 without a new breakpoint tier

The shared `configuracion` layout's grid (heading + tab list beside the routed panel) MUST be fluid (a
fixed-width first column plus a flexible panel) and MUST reproduce T1's measured proportions at T1's
viewport width without adding any constant to `layout.ts` or changing `AppShell`/`Sidebar`/`BottomTabs`.
Below the shell's `lg` breakpoint the layout's two columns MUST stack (heading + tab list above the
routed panel). This grid is shared chrome and MUST apply identically to whichever child route
(`/configuracion` Perfil or `/configuracion/categorias` list) renders inside it. The edit route
(`/configuracion/categorias/:categoriaId`) opts out of this chrome per WCTG-01 and is governed by
WCTG-14 instead.
(Previously: scoped to the single Perfil page's own grid; now scoped to the shared layout route the
route restructure introduces, WCTG-01/§1.)

#### Scenario: T1 width reproduces the measured proportions

- GIVEN the viewport is at T1's width
- WHEN the layout renders (Perfil or the Categorías list inside it)
- THEN the sidebar width/font are unchanged and the layout's own gutter/panel measurements match T1, with
  no new entry in `layout.ts`

#### Scenario: Below `lg` the columns stack

- GIVEN the viewport is below the shell's `lg` breakpoint
- WHEN the layout renders
- THEN the heading and tab list appear above the routed panel instead of beside it

#### Scenario: The edit route does not inherit this grid

- GIVEN the user is on `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN it does not render the shared tab-list grid; the breadcrumb chrome (WCTG-01/WCTG-14) renders
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
