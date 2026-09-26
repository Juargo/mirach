# Mobile Import Preview Specification

**Type**: Mobile client capability of `ingesta-preview-commit`
**Status**: New (this change)
**Depends on**: `openspec/specs/ingesta-preview-commit/spec.md` (canonical backend contract)
**Issue**: #295 (US-061, preview portion only) · ADR-044 (pre-commit categoría choice authorization)

---

## Purpose

Replaces mobile's legacy US-003 upload flow (deprecated one-shot `POST /api/ingestas`,
legacy `muestra`/`estructura` shape, no dedup/suggestion visibility, no editing) with
the canonical `POST /api/ingestas/preview` + `POST /api/ingestas/commit` two-phase flow
already shipped on web (US-059). Mobile is the second consumer of this contract. Adds an
explicit two-action decision step — "Subir tal cual" / "Revisar y editar" — and, when the
user chooses to review, a tap-row bottom sheet for per-row bucket→categoría
classification, committed via the `edits` overlay.

This is a **presentation-only** capability (ADR-024): all validation, dedup detection,
classification suggestion, and amount computation come from the backend. The client only
renders backend-computed fields and collects the classification-edits overlay. Mobile's
write scope for pre-commit classification is authorized by ADR-044 (amending ADR-038
rule 2).

---

## Requirements

### Requirement: MOB-PRV-01 — File selection triggers the canonical preview and a loading state

The system MUST provide a file picker (`expo-document-picker`) accepting `.xlsx` and
`.pdf`. After selection, it MUST call `POST /api/ingestas/preview` and show a loading
state while the request is in flight. The picked file MUST remain held in memory through
to commit, without a second pick interaction.

#### Scenario: Valid file selection transitions to loading state

- GIVEN the user is on the upload screen and picks a valid `.xlsx` file
- WHEN the picker interaction completes
- THEN the screen transitions to a loading state
- AND `POST /api/ingestas/preview` is called with the selected file
- AND no data is written to the database during this step

#### Scenario: Loading state is visible until preview responds

- GIVEN the preview request is in flight
- WHEN the request has not yet returned
- THEN a loading indicator is visible and the user cannot proceed to the decision step

---

### Requirement: MOB-PRV-02 — Preview response guard requires canonical `filas` and `resumen`

The preview response type guard MUST require both `filas` (array, non-null) and
`resumen` (object with `totalFilas`, `duplicadosDetectados`, `nuevas`) to be present. A
response carrying only the deprecated legacy shape (`estructura`/`muestra`, no
`filas`/`resumen`) MUST be treated as an error and MUST NOT reach the decision step or
the row list.

#### Scenario: Response without `filas`/`resumen` is rejected at the boundary

- GIVEN the backend returns 200 with only the legacy `muestra`/`estructura` shape
- WHEN the response guard evaluates it
- THEN the guard returns false and the screen shows an error state, not the decision step

#### Scenario: Canonical response passes the guard

- GIVEN the backend returns 200 with `filas[]` and `resumen.*` present
- WHEN the guard evaluates it
- THEN the guard returns true and the decision step renders

---

### Requirement: MOB-PRV-03 — Preview success renders resumen, a read-only grouped summary, and an explicit two-action decision step

On a successful, guard-passing preview response, the system MUST render:

1. A resumen summary showing `totalFilas`, `duplicadosDetectados`, and `nuevas`.
2. A READ-ONLY accordion summary of `filas[]` grouped by classification
   (cartola-decision-agrupada), collapsed by default, between the resumen and the actions.
3. Two explicit actions — "Subir tal cual" and "Revisar y editar" — plus "Descartar"
   (MOB-PRV-09).

No EDITABLE row list is shown at this step — `ListaRevision`/`FilaRevisionMobile` stay
exclusive to "Revisar y editar" (MOB-PRV-05/06).

The grouped summary (2) uses the SAME grouping rules the web client used before
`resumen-acordeon-bucket` reworked its summary into a two-level accordion (WEB-PRV-19);
this mobile mirror (ported per-app per ADR-008, out of scope for that web-only change)
still implements the flat shape below, not yet realigned with the web client's current
two-level breakdown:

1. A non-duplicate row with `sugerido` non-null and `sugerido.categoriaId` resolvable →
   grouped by `(sugerido.bucket, sugerido.categoriaId)`, heading "{Bucket label} ·
   {Categoría nombre}".
2. A non-duplicate row with `sugerido` non-null, `sugerido.categoriaId === null`, and
   `sugerido.bucket === 'Ingreso'` (the backend's immutable verdict) → grouped by bucket
   alone, heading "Ingreso" with NO "Sin categoría" suffix.
3. A non-duplicate row with `sugerido === null`, OR with `sugerido` non-null,
   `sugerido.categoriaId === null`, and a bucket OTHER than Ingreso (unreachable through
   today's classifier — YAGNI, no speculative group shape for it) → the single "Sin
   clasificar" group.
4. A non-duplicate row whose `sugerido.categoriaId` is present but not resolvable — EITHER
   because the catalog fetch (started as soon as `decidiendo` is entered, MOB-PRV-13) is
   still loading or has failed, or because a loaded catalog no longer contains that id —
   → its own group keyed by `(sugerido.bucket, sugerido.categoriaId)`, heading "{Bucket
   label} · Categoría no disponible". The summary MUST still group by bucket and MUST NOT
   block "Subir tal cual"/"Revisar y editar"/"Descartar" while the catalog is unavailable.
5. A duplicate row (`esDuplicado`) → the single "Duplicadas (no se importan)" group,
   regardless of its `sugerido`.
6. Group order: canonical bucket order (Necesidades, Deseos, Ahorro), then Ingreso, then
   "Sin clasificar", then "Duplicadas". Within a bucket, named-categoría subgroups sort by
   nombre (`localeCompare('es')`) before any "Categoría no disponible" subgroup. Rows keep
   file order within every group.
7. Every group heading MUST show its row count with correct Spanish singular/plural
   agreement ("1 movimiento" / "N movimientos").

Each group's rows show `fecha`, `descripcion`, and `cargo`/`abono` (formatted via the
existing CLP presentation helper) — no classification control anywhere in this summary
(ADR-024: presentation only, no reclassification, no amount computation).

#### Scenario: Decision step shows resumen, the grouped summary (collapsed), and both actions

- GIVEN a successful preview with `resumen.totalFilas=40`, `duplicadosDetectados=5`, `nuevas=35`
- WHEN the decision step renders
- THEN the resumen values are shown
- AND a "Movimientos por categoría" grouped summary is shown, collapsed by default
- AND "Subir tal cual", "Revisar y editar", and "Descartar" are all present
- AND no EDITABLE row list is rendered yet

#### Scenario: While the catalog fetch is still in flight, the summary still groups by bucket and never blocks the actions

- GIVEN a successful preview with a row classified into `(Necesidades, cat-nec-1)`, and the
  catalog fetch (started on entering `decidiendo`, MOB-PRV-13) has not resolved yet
- WHEN the decision step renders
- THEN a "Necesidades · Categoría no disponible" group heading is visible
- AND "Subir tal cual" and "Revisar y editar" remain enabled and functional

#### Scenario: Once the catalog resolves, the summary shows real categoría names

- GIVEN the same row as above, and the catalog fetch resolves successfully naming
  `cat-nec-1` "Arriendo"
- WHEN the decision step re-renders with the resolved catalog
- THEN a "Necesidades · Arriendo" group heading is visible, replacing "Categoría no
  disponible"

#### Scenario: Ingreso rows group on their own, without a "Sin categoría" suffix

- GIVEN a successful preview containing an Ingreso row (`sugerido: { bucket: 'Ingreso',
  categoriaId: null }`)
- WHEN the decision step renders
- THEN an "Ingreso" group heading is visible, with no "Sin categoría" suffix

#### Scenario: Duplicates group separately

- GIVEN a successful preview containing a duplicate row (`esDuplicado: true`)
- WHEN the decision step renders
- THEN a "Duplicadas (no se importan)" group heading is visible, listing that row

---

### Requirement: MOB-PRV-04 — "Subir tal cual" commits immediately with an empty edits overlay

Tapping "Subir tal cual" MUST call `POST /api/ingestas/commit` (`multipart/form-data`)
with the held file and `edits: []` — the user never reached the row list. On success,
the system MUST show the completion state and MUST invalidate any cached
resumen/dashboard queries the way the prior one-shot flow did.

#### Scenario: As-is commit sends an empty edits overlay

- GIVEN the user is at the decision step after a successful preview
- WHEN the user taps "Subir tal cual"
- THEN `POST /api/ingestas/commit` is called with the file and `edits: []`
- AND the request is multipart/form-data

#### Scenario: As-is commit success shows completion

- GIVEN the commit from "Subir tal cual" returns 200
- WHEN the response is handled
- THEN the screen shows a success state reflecting `totalTransacciones` and `duplicadosOmitidos`

---

### Requirement: MOB-PRV-05 — "Revisar y editar" opens the full virtualized row list

Tapping "Revisar y editar" MUST render a virtualized list (`FlatList`) covering **every**
row in `filas[]` — no pagination, no 10/25/50 selector. Each row MUST display `fecha`,
`descripcion`, `cargo`/`abono` (formatted via the existing CLP presentation helper), and
duplicate status.

#### Scenario: All rows render without a page-size selector

- GIVEN a preview response with 180 rows
- WHEN the user taps "Revisar y editar"
- THEN all 180 rows are available in the virtualized list
- AND no 10/25/50 row-count control is present

---

### Requirement: MOB-PRV-06 — Duplicate and Ingreso rows render non-interactive; only non-duplicate, non-Ingreso rows are tappable

Rows where `esDuplicado: true` MUST render with a "Duplicado" badge and MUST NOT be
tappable — no bottom sheet opens for them. Rows the backend classified as income
(`sugerido.bucket === 'Ingreso'`, the same canonical `PreviewFilaDto` field the web
client already reads, `apps/web/src/domain/clasificacion-preview.ts`) MUST also render
non-interactive: no bottom sheet opens and the row shows as already settled, with no
edit affordance. This mirrors the backend contract — `CommitIngestaUseCase` Rule 2
(`apps/api/src/application/use-cases/commit-ingesta.use-case.ts`) always persists an
Ingreso row as `{ Ingreso, null }` and silently discards any overlay entry targeting it,
so offering an edit control would promise a change the server never applies. The client
determines "Ingreso" solely from the backend-provided `sugerido.bucket` field — it MUST
NOT re-derive the rule from `abono`/`cargo` (ADR-024). Non-interactive rows (duplicate
or Ingreso) MUST NOT expose an accessible button role (ADR-018) — a screen reader must
not announce them as actionable.

Only rows that are both non-duplicate AND non-Ingreso MUST be tappable and open the
classification sheet (MOB-PRV-07).

#### Scenario: Duplicate row cannot be tapped

- GIVEN a row with `esDuplicado: true`
- WHEN the user taps that row
- THEN no bottom sheet opens
- AND the row shows a "Duplicado" badge

#### Scenario: Ingreso row cannot be tapped

- GIVEN a row with `esDuplicado: false` and `sugerido.bucket: 'Ingreso'`
- WHEN the user taps that row
- THEN no bottom sheet opens
- AND the row renders as settled, with no edit affordance

#### Scenario: Non-duplicate, non-Ingreso row opens the sheet

- GIVEN a row with `esDuplicado: false` and `sugerido.bucket` not equal to `'Ingreso'`
- WHEN the user taps that row
- THEN the classification bottom sheet opens for that row

#### Scenario: Non-interactive rows are not exposed as buttons

- GIVEN the row list contains a duplicate row and an Ingreso row
- WHEN a screen reader (VoiceOver/TalkBack) traverses the list
- THEN neither row announces an accessible button role
- AND only non-duplicate, non-Ingreso rows announce as actionable

---

### Requirement: MOB-PRV-07 — Tapping a row opens a bottom sheet: bucket, then categoría, from the user's own catalog

The sheet MUST first offer a bucket choice, then filter categoría options to that
bucket, sourced from the user's own catalog (existing `fetchCatalogo` +
`agruparPorBucket` + `BUCKETS_ASIGNABLES`, reused unchanged). Confirming the sheet MUST
store `{ rowIndex, categoriaId }` as a pending edit for that row and close the sheet
without committing. The row MUST then reflect the chosen categoría in the list.

#### Scenario: Selecting a bucket filters categoría options

- GIVEN the sheet is open for a non-duplicate row and the user selects bucket "Deseos"
- WHEN the categoría list renders
- THEN only categories in the user's "Deseos" bucket appear

#### Scenario: Confirming the sheet records a pending edit and updates the row

- GIVEN the user selects bucket "Necesidades" and categoría "Arriendo" in the sheet
- WHEN the user confirms the sheet
- THEN the row's pending edit is `{ rowIndex, categoriaId: <Arriendo's id> }`
- AND the sheet closes
- AND the row in the list now shows "Arriendo"

---

### Requirement: MOB-PRV-08 — Review commit sends the accumulated edits overlay

The review step's commit action MUST call `POST /api/ingestas/commit` with the held
file and `edits` covering only rows the user assigned a categoría in the sheet
(MOB-PRV-07); rows with no pending edit, duplicate rows, and Ingreso rows
(`sugerido.bucket === 'Ingreso'`, MOB-PRV-06) MUST be excluded from the overlay — the
sheet never opens for duplicate or Ingreso rows in the first place, so no pending edit
can exist for them, but the overlay assembly MUST NOT include them even defensively.

#### Scenario: Commit sends only user-edited rows

- GIVEN the user assigned categoría to rows 2 and 7 via the sheet, leaving all others untouched
- WHEN the user confirms commit from the review step
- THEN `edits` contains exactly `[{rowIndex:2,...},{rowIndex:7,...}]`
- AND duplicate rows are excluded regardless of any sheet interaction attempt
- AND Ingreso rows are excluded regardless of any sheet interaction attempt

---

### Requirement: MOB-PRV-09 — Discard/cancel is available at both the decision step and the review step

"Descartar"/"Cancelar" MUST be reachable from the decision step (before any row is
reviewed) and from the review step (after "Revisar y editar"). Either MUST clear the
held file and any pending edits and return to the initial upload state, without calling
commit.

#### Scenario: Discard from the decision step

- GIVEN the user is at the decision step
- WHEN the user taps "Descartar"
- THEN the screen returns to the initial upload state
- AND no `POST /api/ingestas/commit` request is sent

#### Scenario: Cancel from the review step

- GIVEN the user is in the review step with 2 pending edits made
- WHEN the user taps "Cancelar"
- THEN the screen returns to the initial upload state, pending edits cleared
- AND no commit request is sent

---

### Requirement: MOB-PRV-10 — Preview and commit errors show a descriptive message and allow retry

A preview or commit failure MUST show a descriptive error (the backend's scrubbed
message for 4xx; a fixed message for 401/5xx) and MUST let the user retry without
losing already-made progress: a preview failure returns to file selection; a commit
failure from the decision step keeps the decision step visible; a commit failure from
the review step keeps the row list and pending edits intact.

#### Scenario: Preview 400 shows the backend message and allows re-pick

- GIVEN the user picks a file whose bank layout is unrecognized
- WHEN preview returns 400 with a descriptive message
- THEN the screen shows that message and lets the user pick a different file

#### Scenario: Commit failure from review preserves the row list and pending edits

- GIVEN the user has pending edits and confirms commit from the review step
- WHEN `POST /api/ingestas/commit` fails (4xx or 5xx)
- THEN the row list and all pending edits remain intact
- AND a descriptive error is shown
- AND the user can retry commit or discard

---

### Requirement: MOB-PRV-11 — The two decision actions and every sheet control expose accessible labels (ADR-018)

"Subir tal cual", "Revisar y editar", and "Descartar"/"Cancelar" MUST each expose an
accessible name via native accessibility props (e.g. `accessibilityLabel`/
`accessibilityRole`). Inside the classification sheet, the bucket control and the
categoría control MUST each expose an accessible label identifying the field and, where
relevant, the row it applies to.

#### Scenario: Decision actions have accessible labels

- GIVEN the decision step is rendered
- WHEN a screen reader (VoiceOver/TalkBack) focuses each action
- THEN "Subir tal cual", "Revisar y editar", and "Descartar" each announce a distinct, matching accessible name

#### Scenario: Sheet controls have accessible labels

- GIVEN the classification sheet is open for a row
- WHEN a screen reader focuses the bucket control and then the categoría control
- THEN each announces an accessible name identifying that field

---

### Requirement: MOB-PRV-12 — No mobile code path references the deprecated one-shot endpoint

After this change, `apps/mobile/src/api/post-ingesta.ts` MUST be deleted, and no mobile
source file MUST import it or call `POST /api/ingestas`. The 10/25/50 row-count
selector and its supporting code MUST also be removed.

#### Scenario: The one-shot client and selector are gone

- GIVEN the mobile source tree after this change
- WHEN it is searched for `post-ingesta` imports or a row-count selector
- THEN neither is found

### Requirement: MOB-PRV-13 — Catalog loading and failure keep the review list usable

The screen MUST fetch the user's own catalog exactly once per flow, starting as soon as
the decision step (`decidiendo`) is entered — a successful preview response — rather than
deferring it until "Revisar y editar" is tapped (cartola-decision-agrupada; superseded
timing, see the amendment note below). While the catalog is loading, the review row list
MUST stay visible and tapping an editable row MUST NOT open the classification sheet. If
the catalog fetch fails, the screen MUST keep the row list visible, MUST show an inline
error message with a "Reintentar" action that retries the fetch, and the sheet MUST stay
unavailable until the catalog loads successfully. Neither loading nor failure MUST block
the decision-step actions ("Subir tal cual"/"Revisar y editar"/"Descartar", MOB-PRV-03).

(Added at archive: MOB-PRV-06/07/10 were silent on catalog loading and failure; this
records the behavior shipped in `apps/mobile/app/subir.tsx` — `EstadoCatalogo`,
`cargarCatalogo`, testIDs `catalogo-cargando`, `catalogo-error`, `catalogo-reintentar` —
and covered by `apps/mobile/app/subir.spec.tsx`. Amended by `cartola-decision-agrupada`:
the fetch trigger moved from "entering revisando" to "entering decidiendo" so the
MOB-PRV-03 grouped summary can show real categoría names; the "exactly once per flow"
invariant and the loading/failure behavior described above are otherwise unchanged.)

#### Scenario: Sheet unavailable while the catalog loads

- GIVEN the user chose "Revisar y editar" and the catalog request has not resolved
- WHEN the user taps an editable row
- THEN the row list is visible, a loading indicator is shown, and the sheet does not open

#### Scenario: Catalog failure shows a retryable inline error

- GIVEN the catalog request fails
- WHEN the review renders
- THEN the row list stays visible, an inline error with "Reintentar" is shown, and the
  sheet cannot be opened
- AND pressing "Reintentar" fetches the catalog again; on success editable rows open the
  sheet

---

## Out of Scope

- Inline "+ Nueva categoría" creation from the mobile sheet (deferred).
- Editing amounts, dates, or descriptions (server-parsed, authoritative).
- Removing the backend one-shot endpoint or the legacy `muestra`/`estructura` shim
  (tracked by US-061).
- Manual transaction registration and ingesta historial (US-061's other parts, issue #295).
- A full bucket→categoría cascade per row — a tap-row sheet is used instead (product
  decision).

## ADR-024 Boundary (non-negotiable)

The client MUST NOT implement duplicate detection, natural-key comparison, ingreso-rule
derivation, amount parsing/arithmetic, or category suggestion/pattern matching. All of
the above come exclusively from the backend; the client's only write contribution is the
`edits` overlay.

## Testing Emphasis (ADR-014/015)

| Layer | Focus |
|-------|-------|
| Unit — guard | Rejects legacy shape, accepts canonical `filas`+`resumen` |
| Unit — decision step | Both actions present; "Subir tal cual" sends `edits: []`; discard clears state without committing |
| Unit — row list | Duplicate rows non-tappable with badge; Ingreso rows non-tappable with no edit affordance; non-duplicate, non-Ingreso rows open the sheet; no page-size selector; non-interactive rows expose no accessible button role |
| Unit — sheet | Bucket filters categoría to the user's own catalog; confirm records a pending edit and updates the row |
| Integration — commit | Overlay contains only user-edited rows, excluding duplicates and Ingreso rows; commit failure preserves list + edits |
| Unit — catalog | Catalog fetched once on entering review; sheet unavailable while loading or after failure; "Reintentar" refetches (MOB-PRV-13) |
| Manual (ADR-018) | VoiceOver/TalkBack pass over decision actions and sheet controls |
| Regression | No import of `post-ingesta.ts` or the 10/25/50 selector remains |
