# Web Import Preview Specification

**Type**: Web client capability of `ingesta-preview-commit`
**Status**: Complete & deployed (US-059)
**Depends on**: `openspec/specs/ingesta-preview-commit/spec.md` (canonical backend contract)
**Issue**: #293 · Sprint-15 · epic:gestion-datos

---

## Purpose

Replaces the web's legacy one-shot upload flow with the US-057 preview → review → commit
two-phase interaction. The web client is the first consumer of the canonical
`POST /api/ingestas/preview` + `POST /api/ingestas/commit` endpoints.

This is a **presentation-only** capability (ADR-024): all validation, dedup detection,
classification suggestion, and amount computation come from the backend. The client
only renders backend-computed fields and collects the classification-edits overlay.

---

## Requirements

### Requirement: WEB-PRV-01 — File upload triggers preview and shows a loading state

The system MUST provide a file input that accepts `.xlsx` and `.pdf` files only.
After file selection, it MUST display an explicit loading state while `POST /api/ingestas/preview`
is in flight. The `File` object MUST remain in memory throughout the preview→review→commit
flow so it can be included in the commit request without a second user interaction.

#### Scenario: Valid file upload transitions to loading state

- GIVEN the user is on the `/subir` route and selects a valid `.xlsx` file
- WHEN the file picker interaction completes
- THEN the UI transitions to a `previsualizando` loading state
- AND `POST /api/ingestas/preview` is called with the selected file
- AND no data is written to the database during this step

#### Scenario: Loading state is visible until preview responds

- GIVEN the user has selected a file and the preview request is in flight
- WHEN the request has not yet returned
- THEN a loading indicator is visible and the user cannot proceed to the review table

---

### Requirement: WEB-PRV-02 — Preview result renders resumen and the full editable row table

Upon a successful preview response, the system MUST render:

1. A `resumen` header showing `totalFilas`, `duplicadosDetectados`, and `nuevas` (from `resumen.*`).
2. A "nothing has been saved yet" affordance, visible to the user.
3. A table covering **every** row in `filas[]` — no pagination, no row limit (CA-02, product decision 4).

Each row MUST display: `fecha`, `descripcion`, `cargo` (formatted via `formatearMontoCLP`), `abono` (formatted via `formatearMontoCLP`),
suggested classification from `sugerido`, and duplicate status.

The client MUST NOT recompute, re-derive, re-parse, or perform arithmetic on any amount — only
render what the backend returned, applying `formatearMontoCLP` as a display-only transformation (ADR-024).
`formatearMontoCLP` is a presentation helper, not a business-logic computation.

#### Scenario: Resumen header shows correct counts

- GIVEN the preview response has `resumen.totalFilas=120`, `duplicadosDetectados=20`, `nuevas=100`
- WHEN the review step is displayed
- THEN the UI shows "120 filas", "20 duplicados", "100 nuevas" (or equivalent labels)
- AND the "nothing saved yet" affordance is visible

#### Scenario: All filas are rendered without truncation

- GIVEN the preview response contains 250 rows in `filas[]`
- WHEN the review table renders
- THEN all 250 rows are displayed without pagination controls

#### Scenario: Amount fields are rendered formatted via the presentation helper

- GIVEN a row with `cargo: "150000"` and `abono: "0"`
- WHEN the row renders
- THEN the UI displays the amounts formatted via `formatearMontoCLP` (the existing presentation helper, e.g. `"$ 150.000"`)
- AND no BigInt math, no re-computation, and no re-derivation is performed by the client (ADR-024)
- AND the raw backend string is never re-parsed, re-rounded, or re-computed — `formatearMontoCLP` is a display-only transformation applied to the string value as received

---

### Requirement: WEB-PRV-03 — Guard rejects responses lacking canonical filas and resumen

The `esPreviewIngestaDto` type guard MUST require both `filas` (array, non-null) and
`resumen` (object with `totalFilas`, `duplicadosDetectados`, `nuevas`) to be present.
A response lacking either field MUST be treated as an error and MUST NOT reach the
review table render path.

#### Scenario: Response without filas is rejected at the boundary

- GIVEN the backend returns a 200 with only `muestra`/`estructura` (legacy shape) and no `filas`
- WHEN `esPreviewIngestaDto` evaluates the response
- THEN the guard returns false
- AND the UI shows an error state, not an empty review table

#### Scenario: Response with canonical shape passes the guard

- GIVEN the backend returns a 200 with `filas[]` and `resumen.*` present
- WHEN `esPreviewIngestaDto` evaluates the response
- THEN the guard returns true and the review table renders

---

### Requirement: WEB-PRV-04 — Duplicate rows render greyed with a badge and disabled selects

Rows where `esDuplicado: true` MUST render visually distinct (greyed-out) with a
"Duplicado" badge. Their bucket and categoría selects MUST be **disabled** — the user
cannot edit the classification of a duplicate row. Non-duplicate rows remain fully
interactive (WEB-PRV-05).

#### Scenario: Duplicate row is greyed with badge and disabled controls

- GIVEN a preview row with `esDuplicado: true`
- WHEN the review table renders
- THEN the row is visually greyed and shows a "Duplicado" badge
- AND the bucket select and categoría select for that row are disabled
- AND the row is included in the `resumen.duplicadosDetectados` count display

#### Scenario: Non-duplicate row is interactive

- GIVEN a preview row with `esDuplicado: false`
- WHEN the review table renders
- THEN the row's selects are enabled and interactive

---

### Requirement: WEB-PRV-05 — Bucket→categoría cascade editing uses the user's own catalog only

For non-duplicate rows, the system MUST provide a two-level cascade: first a bucket
select (Necesidades / Deseos / Ahorro — only buckets the user actually has categories in,
as returned by `agruparPorBucket`; empty buckets are dropped by that function), then a
categoría select filtered to categories belonging to that bucket from the **user's own
catalog** (via `useCategorias` + `agruparPorBucket`). Selecting a bucket MUST restrict
the categoría options to that bucket's categories. Rows MAY remain unassigned
(`categoriaId: null`); this does not block commit (product decision 2).

The catalog MUST be available before the review table renders (co-fetched or preloaded
on `/subir`).

#### Scenario: Selecting a bucket filters categoría options

- GIVEN a non-duplicate row with no prior edit and the user selects bucket "Deseos"
- WHEN the categoría select renders
- THEN only categories belonging to the user's "Deseos" bucket appear as options

#### Scenario: Changing bucket resets the categoría selection

- GIVEN the user has selected bucket "Deseos" and categoría "Restaurantes" for a row
- WHEN the user changes the bucket to "Necesidades"
- THEN the categoría select is reset and shows only categories in "Necesidades"

#### Scenario: Row with no categoría selection remains committable

- GIVEN the user leaves a non-duplicate row without selecting a bucket or categoría
- WHEN the user clicks "Agregar transacciones"
- THEN commit proceeds with `categoriaId: null` for that row (no blocking gate, no warning)

#### Scenario: Catalog is available when the review table first renders

- GIVEN the user is on `/subir` and the catalog fetch has completed (co-fetch or preload)
- WHEN the review table appears after a successful preview
- THEN the bucket and categoría selects are populated immediately (no secondary loading spinner for the catalog)

---

### Requirement: WEB-PRV-06 — "Agregar transacciones" commits with the edits overlay and navigates to the dashboard

Clicking "Agregar transacciones" MUST send a `multipart/form-data` request to
`POST /api/ingestas/commit` with:
- `file`: the same `File` object held from the upload step.
- `edits`: a JSON string of `[{ rowIndex: number, categoriaId: string | null }]`
  covering only the rows the user edited (excluding unedited and duplicate rows).

On success, the system MUST invalidate the dashboard query keys
(`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']`)
and navigate to `/` (product decision 3). No success panel is shown.

#### Scenario: Commit sends file and edits overlay

- GIVEN the user has edited categoría for row 3 to "cat_manual" and left all others unchanged
- WHEN the user clicks "Agregar transacciones"
- THEN `POST /api/ingestas/commit` is called with `file` and `edits: [{"rowIndex":3,"categoriaId":"cat_manual"}]`
- AND the request is multipart/form-data

#### Scenario: Successful commit invalidates dashboard queries and navigates to /

- GIVEN the commit response is 201
- WHEN the success callback runs
- THEN the query keys `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']` are invalidated
- AND the router navigates to `/`
- AND no intermediate success panel is shown

#### Scenario: Rows without user edits are not included in the edits overlay

- GIVEN the user edited only row 5 and left all other rows unmodified
- WHEN the edits overlay is assembled for the commit request
- THEN the overlay contains only `{ rowIndex: 5, categoriaId: <chosen> }`
- AND duplicate rows are excluded from the overlay regardless of any disabled-select state

#### Scenario: Commit 400 error — review table and edits are preserved for retry

- GIVEN the user has edited rows and clicked "Agregar transacciones"
- WHEN `POST /api/ingestas/commit` returns a 400 with `body.message: "Ediciones inválidas"`
- THEN the review table REMAINS rendered with all rows and edits intact
- AND an inline descriptive error message "Ediciones inválidas" appears in the `role="alert"` region
- AND the "Agregar transacciones" button is accessible so the user can retry with the same file and same edits
- AND the file picker is re-enabled so the user can pick a new file (which resets the flow)
- AND no page reload occurs

#### Scenario: Commit 500 error — same preserve-and-retry behavior

- GIVEN the user has edited rows and clicked "Agregar transacciones"
- WHEN `POST /api/ingestas/commit` returns a 500 (infrastructure fault)
- THEN the review table REMAINS rendered with all rows and edits intact
- AND an inline error message appears in the `role="alert"` region
- AND the user can retry the commit or pick a new file without losing their edits

#### Scenario: Picking a new file after a commit error resets the flow

- GIVEN the commit returned a 400 error and the review table is still rendered
- WHEN the user picks a new file via the file input
- THEN `handleFileChange` clears the edits map and resets both mutations
- AND a new preview request is sent for the new file
- AND the previous edits do NOT appear in the new review table

---

### Requirement: WEB-PRV-07 — "Descartar" clears the flow and returns to the dashboard

Clicking "Descartar" MUST reset the state machine (clear the held `File` and `edits`
map, return to `idle`) and navigate to `/`. Because preview writes nothing, no
server-side cleanup is needed.

#### Scenario: Discard resets state and navigates away

- GIVEN the user is on the review step after a successful preview
- WHEN the user clicks "Descartar"
- THEN the state machine returns to `idle` (File and edits cleared)
- AND the router navigates to `/`
- AND no `POST /api/ingestas/commit` request is sent

#### Scenario: Edits do not survive a discard-then-reupload cycle

- GIVEN the user edited some rows, then discarded, then uploaded a new file
- WHEN the new preview response arrives
- THEN the `edits` map is empty (edits from the previous session are gone)

---

### Requirement: WEB-PRV-08 — Preview errors show a descriptive message and allow retry without reload

When `POST /api/ingestas/preview` returns a 4xx response, the system MUST:
- Display the `body.message` verbatim for **400** responses (backend-generated scrubbed Spanish message).
- Display a fixed message for **401** responses (session expired or missing API key).
- Allow the user to pick a different file and retry the upload without a page reload.
- Transition the state machine to `preview-error`; the file input is re-enabled so the user can pick another file. Picking a new file is what resets `previewMutation` and the (trivially empty, since preview never succeeded) edits map. There is no automatic transition back to `idle` on error.

#### Scenario: 400 unrecognized-bank error shows backend message and allows retry

- GIVEN the user uploads a file whose bank layout is unrecognized
- WHEN the preview returns 400 with `body.message: "No se reconoció el banco del archivo"`
- THEN the UI transitions to `preview-error` and displays "No se reconoció el banco del archivo"
- AND the file input is re-enabled so the user can pick another file
- AND no page reload occurs

#### Scenario: 401 shows a fixed session-expired message

- GIVEN the user's session has expired before the preview call
- WHEN the preview returns 401
- THEN the UI transitions to `preview-error` and displays a fixed authentication-error message (not the body.message)
- AND the file input is re-enabled for retry

#### Scenario: preview-error state keeps the file input enabled for re-pick

- GIVEN a 400 error is received from preview and the state is `preview-error`
- WHEN the user picks a new file via the file input
- THEN `handleFileChange` resets `previewMutation`, clears the (empty) edits map, and initiates a new preview request
- AND the previous error message is no longer shown

---

### Requirement: WEB-PRV-09 — Per-row selects have accessible labels (CA-07)

Every per-row `<select>` element in the review table MUST have an accessible label
that identifies both the row and the field (bucket or categoría). Visually-hidden
labels (e.g. `"Fila {n}: bucket"` / `"Fila {n}: categoría"`) are acceptable.
`eslint-plugin-jsx-a11y` MUST report no errors for the review table component.

#### Scenario: Per-row bucket select has an accessible label

- GIVEN the review table renders row 5
- WHEN a screen reader focuses the bucket select for row 5
- THEN the accessible name resolves to a label that identifies row 5 and the field as "bucket" (or equivalent)

#### Scenario: jsx-a11y lint passes clean for FilaRevision

- GIVEN `FilaRevision.tsx` is linted with `eslint-plugin-jsx-a11y` at error level
- WHEN the lint run completes
- THEN zero a11y errors are reported for that file

---

### Requirement: WEB-PRV-10 — Responsive layout works on tablet viewports T1 and T2

The review table MUST be usable at tablet viewport widths T1 (768px) and T2 (1024px).
Overflow must not break the layout at those widths.

#### Scenario: Review table is usable at T1 tablet width

- GIVEN the browser viewport is set to 768px width
- WHEN the review table renders with 50 rows
- THEN the table is scrollable or adapts without horizontal overflow breaking the page layout
- AND all action buttons ("Agregar transacciones", "Descartar") remain accessible

---

### Requirement: WEB-PRV-11 — Legacy one-shot flow remains untouched

`useIngesta`, `postIngesta`, and the deprecated `POST /api/ingestas` endpoint MUST
remain live and behaviorally unchanged. US-059 does not import or invoke any part
of the legacy one-shot path; it only introduces the new preview→review→commit path
alongside. Physical removal is tracked by US-061.

#### Scenario: Legacy hook and client function are not imported by the new flow

- GIVEN the new `useCommitIngesta` hook and `SubirCartola` state machine changes
- WHEN the dependency graph of the modified components is inspected
- THEN `useIngesta` and `postIngesta` are NOT imported by the new preview/commit code paths
- AND the old `useIngesta` and `postIngesta` exports still exist and are importable

#### Scenario: Regression guard — one-shot path is behaviorally unchanged

- GIVEN a consumer that directly calls `postIngesta` / `useIngesta`
- WHEN the cartola upload executes the old one-shot flow
- THEN the behavior is identical to before US-059 (same request shape, same response handling)

---

### Requirement: WEB-PRV-12 — The "+" control is scoped to rows with a bucket chosen, hidden for duplicates, and demo-gated

A "+" control ("Nueva categoría") MUST render to the right of a preview row's
categoría select, under the exact same condition WEB-PRV-05 already gates the
categoría select on: a bucket has been chosen for that row (locked decision
2). It MUST NOT render for rows where `esDuplicado: true` (duplicate rows are
never editable, WEB-PRV-04). When the session is a demo session (`esDemo`),
the control MUST render disabled with the same house demo-note pattern the
catalog CRUD screens already use (`MENSAJE_DEMO_CATALOGO`); the server still
enforces `DEMO_SOLO_LECTURA` independently (CAT038-10) as the authoritative
gate.

#### Scenario: "+" is hidden until a bucket is chosen

- GIVEN a non-duplicate row where the user has not yet chosen a bucket
- WHEN the row renders
- THEN the "+" control is not rendered

#### Scenario: "+" appears once a bucket is chosen

- GIVEN a non-duplicate row where the user selects a bucket
- WHEN the categoría select becomes available (WEB-PRV-05)
- THEN the "+" control also renders, to the right of the categoría select

#### Scenario: "+" never renders for a duplicate row

- GIVEN a row with `esDuplicado: true`
- WHEN the row renders
- THEN no "+" control appears, regardless of any bucket state

#### Scenario: "+" is disabled with the demo note in a demo session

- GIVEN an authenticated demo session viewing a row with a bucket chosen
- WHEN the row renders
- THEN the "+" control is rendered but disabled, with the same demo-note affordance the catalog CRUD screens use

### Requirement: WEB-PRV-13 — The creation form collects nombre and an editable patrones list, with the bucket fixed to the row's bucket

Activating "+" MUST open a form containing:

- `Nombre` — required text input.
- The row's chosen bucket, shown read-only (not editable) — locked decision 2.
- A patrones editor: one entry prefilled with `{ patron: <row's descripcion>, matchType: 'CONTAINS' }` (locked decision 3), editable and removable; the user MAY add further entries; each entry's `matchType` MUST offer `CONTAINS`/`STARTS_WITH`/`REGEX`. The list MAY be emptied entirely — zero patrones is a valid submission (CAT038-10).
- `Cancelar` and `Guardar` actions.

The form MUST support: `Escape` cancels and closes the form without saving;
opening the form MUST move focus into it (the `Nombre` field or the form's
first focusable element); closing it (via Cancelar, Escape, or a successful
Guardar) MUST return focus to the "+" control that opened it, except where
WEB-PRV-15's post-save re-render explicitly moves focus elsewhere.

#### Scenario: Opening the form prefills the first patrón from the row description

- GIVEN a row with `descripcion: "COMPRA PETCO"` and a bucket chosen
- WHEN the user activates "+"
- THEN the form opens with one patrón entry: `{ patron: "COMPRA PETCO", matchType: "CONTAINS" }`
- AND that entry is editable and removable

#### Scenario: The bucket field is shown but not editable

- GIVEN the row's chosen bucket is "Deseos"
- WHEN the creation form opens
- THEN "Deseos" is displayed as the categoría's bucket
- AND no control in the form allows changing it

#### Scenario: The user can add and remove patrón entries

- GIVEN the creation form is open with its one prefilled patrón entry
- WHEN the user adds a second entry and then removes the first
- THEN exactly one patrón entry remains, reflecting the user's edits

#### Scenario: Zero patrones is a valid submission

- GIVEN the user removes the only (prefilled) patrón entry
- WHEN they click Guardar with `Nombre` filled
- THEN the form submits with an empty patrones list (no client-side block)

#### Scenario: Escape cancels without saving

- GIVEN the creation form is open with unsaved edits
- WHEN the user presses `Escape`
- THEN the form closes, no request is sent, and focus returns to the "+" control

#### Scenario: Opening the form moves focus into it

- GIVEN the user activates "+" on a row
- WHEN the form opens
- THEN keyboard focus lands inside the form

### Requirement: WEB-PRV-14 — Save errors keep the form open and place the message at the failing field

Clicking Guardar MUST call the extended `POST /api/categorias`
(CAT038-10/CAT038-11) with the form's `nombre`, the row's fixed bucket, and
the current patrones list. On any error response, the form MUST remain open
with the user's entered values intact, and the message MUST be rendered via
the existing closed `mensajeDeErrorCatalogo` map. A per-patrón error
(identified by index, CAT038-11) MUST be placed at that specific patrón
entry, not as a single form-level message indistinguishable from a
nombre/bucket-level error.

#### Scenario: Duplicate nombre keeps the form open with the mapped message

- GIVEN the caller already owns a categoría named "Mascotas"
- WHEN they submit `nombre: "mascotas"` and click Guardar
- THEN the form stays open, no navigation occurs, and the mapped duplicate-name message renders
- AND nothing is persisted

#### Scenario: An invalid REGEX patrón error is placed at that entry

- GIVEN the form has two patrón entries and the second has an invalid REGEX
- WHEN the user clicks Guardar
- THEN the response identifies index 1 (CAT038-11)
- AND the mapped error message renders at the second patrón entry, not at the top of the form
- AND nothing is persisted

### Requirement: WEB-PRV-15 — On save success, the originating row adopts the new categoría as an explicit edit and the catalog is refreshed

On a successful (`201`) save, the system MUST, in order:

1. Set the originating row's edit to the newly created categoría's id via the
   same `edits` overlay mechanism WEB-PRV-06 already uses — this MUST happen
   even if none of the new patrones match that row's own description (locked
   decision 1). This is an explicit edit like any user-made override: it
   survives subsequent re-runs the same way WEB-PRV-06's existing edits
   already do.
2. Invalidate the catalog query (`['categorias']`) so the new categoría
   appears as an option in every row's categoría select, including rows
   other than the originating one.
3. Re-run `POST /api/ingestas/preview` with the SAME `File` object already
   held in state (WEB-PRV-01), preserving the current `edits` map unchanged
   except for step 1's addition.

Rows that already carry a prior user edit MUST keep that edit through the
re-run (edits always win, existing `resolverCategoriaMerged` rule — no
special-casing introduced by this change). Rows with no prior edit MUST
display whatever `sugerido` the re-run backend response now returns for them,
which MAY be the new categoría if one of its patrones matches.

#### Scenario: The originating row adopts the new categoría even with no matching patrón

- GIVEN the user creates a categoría from a row with zero patrones (or patrones that don't match that row's own description)
- WHEN the save succeeds
- THEN that row's merged categoría is the new categoría, held as an explicit edit

#### Scenario: Untouched rows pick up the new categoría after the re-run

- GIVEN 3 other untouched rows whose descriptions match the new categoría's patrones
- WHEN the save succeeds and the preview re-run completes
- THEN those 3 rows now show the new categoría as their merged (`sugerido`) value

#### Scenario: Previously edited rows keep their prior override through the re-run

- GIVEN a row the user had already manually reassigned to a different categoría
- WHEN a new categoría is created from a different row and the preview re-runs
- THEN the previously-edited row still shows its prior manual categoría, unaffected by the new patrones

#### Scenario: The catalog refresh makes the new categoría selectable everywhere

- GIVEN the save succeeded
- WHEN any other row's categoría select is opened afterward
- THEN the new categoría appears among its bucket's options

### Requirement: WEB-PRV-16 — The re-run announces how many rows changed suggestion, and the progress readout reflects it

After a successful save and preview re-run (WEB-PRV-15), the system MUST
announce, via a `role="status"` region, how many rows changed suggested
classification as a result — including the zero case (e.g. "N movimientos
ahora sugieren «X»" when N > 0, or an equivalent "no other row matched"
message when N = 0). "Changed" MUST be computed by comparing each row's
merged categoría before vs. after the re-run, excluding the originating row
(which always changes, per WEB-PRV-15, and is not part of this count) and
excluding rows with a prior explicit edit (which cannot change, per
WEB-PRV-15). The classification progress readout (the "N de M clasificadas"
count and its progress bar — the same readout `resolverCategoriaMerged`
already backs) MUST reflect the post-re-run state.

#### Scenario: Announcement reports a positive count

- GIVEN 3 untouched rows newly match the created categoría's patrones after the re-run
- WHEN the re-run completes
- THEN the `role="status"` region announces that 3 rows now suggest the new categoría

#### Scenario: Announcement reports the zero case

- GIVEN no other row's description matches any of the new categoría's patrones
- WHEN the re-run completes
- THEN the `role="status"` region announces that no other row matched
- AND this is not treated as an error state

#### Scenario: The classification progress readout updates after the re-run

- GIVEN the "N de M clasificadas" readout showed a given count before the save
- WHEN the re-run completes and additional rows now have a merged categoría
- THEN the readout's count and progress bar reflect the new, larger classified count

### Requirement: WEB-PRV-17 — A preview re-run failure after a successful save does not lose the created categoría or the prior review state

If `POST /api/ingestas/preview` fails during the WEB-PRV-15 re-run (after the
categoría was already created successfully server-side), the system MUST:

- Keep the previous (pre-re-run) preview table on screen, with all prior
  `edits` intact, rather than blanking the review to an error screen.
- Show an inline error describing that the refresh failed.
- Leave the newly created categoría in place — it already exists server-side
  and remains selectable in every categoría select (the catalog query
  invalidation in step 2 of WEB-PRV-15 already completed independently of the
  preview re-run's own outcome).

#### Scenario: Re-run failure preserves the review table and the created categoría

- GIVEN a categoría was just created successfully and the preview re-run then fails (e.g. a 500)
- WHEN the failure is handled
- THEN the review table still shows the rows and edits from before the re-run attempt
- AND an inline error is shown describing the refresh failure
- AND the new categoría still appears as an option in every categoría select

### Requirement: WEB-PRV-18 — rowIndex identity is stable across two preview runs of the same file, and this is independently verified

WEB-PRV-15's re-run depends on `rowIndex` continuing to identify the same
logical row across two separate `POST /api/ingestas/preview` calls for the
same `File` — the entire `edits` overlay (WEB-PRV-06) is keyed by it, and
this change is the first caller that invokes preview twice for one file in a
single session. The backend's existing `rowIndex` contract already declares
it "stable for a given file bytes + server parse run"
(`ingesta-preview-commit` spec, PREV-EXT-01); this requirement makes the
double-call case an explicit, independently tested guarantee rather than an
assumption: a test in the preview use case or parser layer MUST assert that
parsing the same file bytes twice yields an identical `rowIndex` ↔ row
mapping (same row, same `fecha`/`descripcion`/`cargo`/`abono`, at the same
index, both times).

#### Scenario: Two preview runs of the same file yield identical row identity

- GIVEN a fixture cartola file
- WHEN it is previewed twice in sequence (same bytes, two separate server parse runs)
- THEN every `rowIndex` in the second run's `filas[]` refers to the same logical row (identical `fecha`/`descripcion`/`cargo`/`abono`) as that same `rowIndex` did in the first run

## Out of Scope

- **Persisted transactions** — no retroactive reclassification of
  already-committed transactions (tracked separately, issue #331 / US-062).
  Only the in-flight preview's rows are affected by the re-run.
- **Editing or deleting** an existing categoría or its patrones from the
  preview — this change is creation-only; use `/configuracion/categorias`
  for edit/delete.
- **Mobile** (`apps/mobile`) — untouched; the "+" control and creation form
  are web-only.
- Priority editing for newly created patrones — the server default applies
  (CAT038-10).

## Testing Emphasis (ADR-014/015)

| Layer | Focus |
|-------|-------|
| Unit — "+" visibility | Hidden with no bucket chosen; visible once chosen; never rendered for duplicate rows; disabled with demo note when `esDemo` |
| Unit — creation form | Prefilled first patrón from row description; bucket read-only; add/remove entries; zero-patrones submission allowed; Escape cancels; focus enters on open, returns to trigger on close |
| Unit — save error handling | Per-patrón error placed at the correct entry via its index; form-level errors (duplicate nombre) via `mensajeDeErrorCatalogo`; nothing persisted, form stays open |
| Unit/Integration — save success orchestration | Originating row's edit set to new id even with zero matching patrones; catalog query invalidated; preview re-run called with the same `File`; prior edits preserved through the re-run |
| Unit — announcement | Correct count computed excluding the originating row and previously-edited rows; zero case renders a non-error message; progress readout reflects the new classified count |
| Integration — re-run failure | Prior table and edits preserved on re-run failure; created categoría still selectable; inline error shown |
| Backend/parser — rowIndex stability | Same file bytes parsed twice yield an identical `rowIndex` ↔ row mapping (WEB-PRV-18) |

---

## ADR-024 Boundary (non-negotiable)

The client MUST NOT implement any of the following:
- Duplicate detection or natural-key comparison.
- Ingreso rule derivation (`abono > 0 && cargo === 0`).
- Amount parsing, reformatting, or arithmetic.
- Category suggestion or pattern matching.

All of the above come exclusively from the backend. The client's only write
contribution to the flow is the `edits` overlay (`[{ rowIndex, categoriaId }]`).
