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

## ADR-024 Boundary (non-negotiable)

The client MUST NOT implement any of the following:
- Duplicate detection or natural-key comparison.
- Ingreso rule derivation (`abono > 0 && cargo === 0`).
- Amount parsing, reformatting, or arithmetic.
- Category suggestion or pattern matching.

All of the above come exclusively from the backend. The client's only write
contribution to the flow is the `edits` overlay (`[{ rowIndex, categoriaId }]`).
