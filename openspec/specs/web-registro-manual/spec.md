# Web Manual Movement Registration Specification

**Type**: Web client capability of `movimiento-manual`
**Status**: Complete & deployed (US-060)
**Depends on**: `openspec/specs/movimiento-manual/spec.md` (canonical backend contract — `POST /api/movimientos`)
**Issue**: #294 · Sprint-15 · epic:gestion-datos

---

## Purpose

Adds the web UI surface for manual movement registration. Users can record a single
Ingreso or Gasto by hand via a dedicated `/registrar` route. The form is type-first:
`tipo` drives conditional field rendering (no cascade for Ingreso; bucket→categoría
cascade for Gasto). The backend carries all business logic (ADR-024); the client only
collects and transmits the correct discriminated-union variant.

This is a **presentation + collection only** capability (ADR-024): Ingreso auto-classification,
Gasto catalog/bucket validation, money arithmetic, and the `origen="Manual"` marker all
come from the backend. The client SHAPE-validates inputs client-side (non-future date,
positive-integer string, non-empty fields, chosen bucket+categoría) without re-implementing
any business rule.

---

## Requirements

### Requirement: WEB-REG-01 — `/registrar` route renders the form with a nav entry

The system MUST expose a `/registrar` leaf route under the authenticated layout.
The route MUST be a thin container: it reads `esDemo` from the authenticated route
context and renders `<RegistrarMovimientoForm esDemo={esDemo} />` with no logic of
its own. A **"Registrar"** item MUST appear in the main navigation at the same level
as "Subir nuevo archivo", linking to `/registrar`.

#### Scenario: Authenticated user can navigate to /registrar

- GIVEN a logged-in user
- WHEN they navigate to `/registrar`
- THEN the `RegistrarMovimientoForm` renders
- AND the nav item "Registrar" is visible and active

#### Scenario: Unauthenticated access is blocked by the existing auth guard

- GIVEN no authenticated session
- WHEN the browser loads `/registrar`
- THEN the existing authenticated layout guard redirects to the login route
- AND `RegistrarMovimientoForm` is never mounted

---

### Requirement: WEB-REG-02 — Type-first form fields with today-defaulted fecha

The form MUST present fields in this order: `tipo` selector (Ingreso / Gasto) first,
then `fecha` (`<input type="date">`, default value = today in YYYY-MM-DD, `max` = today),
then `descripcion` (text), then `monto` (positive-integer CLP input). The `tipo` selector
MUST be the first control the user interacts with; it drives what follows.

#### Scenario: Form renders with fecha defaulting to today

- GIVEN the user opens `/registrar`
- WHEN the form mounts
- THEN the `fecha` field's value equals today's date in YYYY-MM-DD
- AND the `fecha` field's `max` attribute equals today's date
- AND the `tipo` selector is the first interactive control

#### Scenario: Future fecha is blocked at the field level

- GIVEN the user attempts to set `fecha` to tomorrow
- WHEN the date input is inspected
- THEN the `max` attribute prevents PICKER selection of future dates (typed input can bypass `max` in some browsers)
- AND submit-time pre-validation (`esFechaValida(fecha) && fecha <= hoyLocal()`) (the `America/Santiago` local-date helper in `domain/fecha.ts`) also rejects it before any fetch, serving as the authoritative gate

---

### Requirement: WEB-REG-03 — Ingreso branch sends strict variant with no stray fields

When `tipo=Ingreso`, the system MUST NOT render bucket or categoría selectors.
The submitted request body MUST be the strict Ingreso variant `{ tipo, fecha, descripcion, monto }`
with **no** `bucket` or `categoriaId` keys present. Switching from Gasto to Ingreso
MUST zero the component state for `bucket` and `categoriaId` (not merely hide the
selects), so neither key can appear in a subsequent Ingreso submission.

#### Scenario: Ingreso selected — no cascade selectors rendered

- GIVEN the user selects `tipo=Ingreso`
- WHEN the form re-renders
- THEN no bucket select and no categoría select are present in the DOM
- AND only `fecha`, `descripcion`, `monto`, and `tipo` controls are visible

#### Scenario: Switching Gasto→Ingreso zeroes cascade state

- GIVEN the user selected `tipo=Gasto`, chose bucket "Deseos", and chose a categoría
- WHEN the user switches `tipo` back to Ingreso
- THEN bucket and categoría component state are reset to `''` (empty string)
- AND the selectors are removed from the DOM

#### Scenario: Ingreso submit body contains no stray fields

- GIVEN `tipo=Ingreso`, a valid fecha, descripcion, and monto
- WHEN the user submits the form
- THEN `POST /api/movimientos` is called with exactly `{ tipo, fecha, descripcion, monto }`
- AND the body does NOT contain `bucket` or `categoriaId`

---

### Requirement: WEB-REG-04 — Gasto branch shows bucket→categoría cascade from the user's catalog

When `tipo=Gasto`, the system MUST render a bucket select (Necesidades / Deseos / Ahorro,
showing only buckets the user actually has categories in, as returned by `agruparPorBucket`)
followed by a categoría select filtered to that bucket's categories from the user's own
catalog (via `useCategorias` + `agruparPorBucket`). Selecting a bucket MUST reset the
categoría selection and restrict options to that bucket. Both `bucket` and `categoriaId`
MUST be included in the Gasto request body.

#### Scenario: Gasto selected — cascade appears with user's buckets

- GIVEN the user selects `tipo=Gasto` and the catalog is loaded
- WHEN the form re-renders
- THEN a bucket select appears listing only the user's non-empty buckets
- AND the categoría select is present but DISABLED until a bucket is chosen (disabled-in-DOM)

#### Scenario: Selecting a bucket populates the categoría select

- GIVEN `tipo=Gasto` and the user selects bucket "Deseos"
- WHEN the bucket select changes
- THEN the categoría select becomes ENABLED and lists only categories belonging to "Deseos" in the user's catalog

#### Scenario: Changing bucket resets the categoría selection

- GIVEN the user selected bucket "Deseos" and categoría "Restaurantes"
- WHEN the user changes bucket to "Necesidades"
- THEN the categoría select resets (no value selected) and shows only "Necesidades" categories

#### Scenario: Gasto submit body includes bucket and categoriaId

- GIVEN `tipo=Gasto`, bucket "Ahorro", a valid categoriaId from that bucket, a valid fecha, descripcion, and monto
- WHEN the user submits the form
- THEN `POST /api/movimientos` is called with `{ tipo, fecha, descripcion, monto, bucket, categoriaId }`
- AND the response is 201

#### Scenario: Catalog query error — cascade INCOMPLETE (bucket or categoría not yet chosen) — submit blocked

- GIVEN the user selected `tipo=Gasto` and had NOT yet chosen both a bucket and a categoría (at least one is still `''`)
- WHEN the catalog query errors (network or server fault)
- THEN an inline `role="alert"` message announces the catalog load failure
- AND both cascade selects are disabled (degraded state)
- AND any previously selected `bucket` or `categoriaId` state is KEPT (not cleared)
- AND if the user attempts to submit, it is blocked by the Gasto pre-validation check (both `bucket` and `categoriaId` must be non-empty, and the selects are unusable)

#### Scenario: Catalog query error — cascade COMPLETE (both bucket and categoría already chosen, state KEPT) — submit proceeds

- GIVEN the user selected `tipo=Gasto`, had already chosen a bucket AND a categoría, and THEN the catalog query errors
- WHEN the catalog query errors (network or server fault)
- THEN an inline `role="alert"` message announces the catalog load failure
- AND both cascade selects are disabled (degraded state)
- AND the previously selected `bucket` and `categoriaId` state are KEPT (not cleared)
- AND if the user submits, the request proceeds (both values are non-empty, so Gasto pre-validation passes)
- AND the backend validates the (bucket, categoría) pairing — the backend is the sole authority (ADR-024)

---

### Requirement: WEB-REG-05 — Client-side pre-validation before the fetch

Before issuing `POST /api/movimientos`, the system MUST validate:

- `fecha` ≤ today via the composite `esFechaValida(fecha) && fecha <= hoyLocal()` (`esFechaValida` checks parseability only; the `<= hoyLocal()` comparison is the business-rule gate)
- `monto` is a positive integer string via the composite `esMontoManualValido` (`esMontoStringValido(monto) && !monto.startsWith('-') && monto !== '0'`; `esMontoStringValido` alone accepts negatives and zero)
- `descripcion` is non-empty
- For `tipo=Gasto`: both `bucket` and `categoriaId` are present

Failures MUST show per-field or per-section error messages. The request MUST NOT be
sent when pre-validation fails. Input MUST be preserved on validation failure.

#### Scenario: Empty descripcion fails pre-validation

- GIVEN the user leaves `descripcion` blank and clicks submit
- WHEN pre-validation runs
- THEN no fetch is issued
- AND a descriptive error for the `descripcion` field is shown
- AND all other field values are preserved

#### Scenario: Gasto with missing categoriaId fails pre-validation

- GIVEN `tipo=Gasto`, a bucket is selected, but no categoría is selected
- WHEN the user clicks submit
- THEN no fetch is issued
- AND an error indicates that categoría is required

---

### Requirement: WEB-REG-06 — Double-submit guard prevents duplicate movements

The system MUST prevent a second submit while a mutation is in flight. The guard MUST
use an `isSubmittingRef` (`useRef<boolean>`) — not only `mutation.isPending` — to cover
the stale-render gap between two synchronous clicks. A second click while `isSubmittingRef.current === true` MUST be a no-op.

#### Scenario: Second click while request in flight is ignored

- GIVEN the user clicked submit and `POST /api/movimientos` is in flight
- WHEN the user clicks submit a second time synchronously
- THEN only one request is sent to the backend
- AND the form does not reset or show an error for the duplicate click

---

### Requirement: WEB-REG-07 — Success: inline confirmation, form clears, dashboard invalidated

On a 201 response, the system MUST:

1. Clear all form fields (`fecha` resets to today, other fields to empty/default).
2. Show an inline confirmation message in an `aria-live` / `role="status"` region.
3. Offer an **"Ir al dashboard"** link. The link is ALWAYS present near the submit (not conditionally rendered on 201); navigation MUST NOT be automatic.
4. Invalidate the four dashboard query keys: `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']`.

All four keys MUST be invalidated regardless of `tipo` (acceptable over-invalidation).

#### Scenario: 201 success — form clears and confirmation appears

- GIVEN the user submitted a valid Ingreso and the response is 201
- WHEN `onSuccess` runs
- THEN all form fields are cleared (fecha = today, descripcion = `""`, monto = `""`, tipo resets to `'Ingreso'`, bucket and categoriaId clear to `''`)
- AND an inline confirmation is visible in a live region
- AND an "Ir al dashboard" link is present

#### Scenario: 201 success — dashboard queries invalidated

- GIVEN the response is 201
- WHEN `onSuccess` runs
- THEN `queryClient.invalidateQueries(['resumen'])` is called
- AND `queryClient.invalidateQueries(['resumen-anual'])` is called
- AND `queryClient.invalidateQueries(['detalle-bucket-mes'])` is called
- AND `queryClient.invalidateQueries(['ingresos-mes'])` is called

#### Scenario: No auto-navigation on success

- GIVEN the response is 201
- WHEN `onSuccess` runs
- THEN the router does NOT navigate away from `/registrar` automatically
- AND the user remains on the form (cleared) with the confirmation visible

---

### Requirement: WEB-REG-08 — Error: fixed message shown, all input preserved

On any error (API 400, 401, network fault, or pre-validation failure), the system MUST
preserve every field's current value. The form MUST NOT be cleared on error.

- **400 (no body)**: the backend returns no JSON on 400; the client MUST show one fixed
  scrub-safe fallback message (e.g. "Datos inválidos. Revisá los campos y volvé a intentar.").
- **401**: a fixed session-expired message.
- **Network/server**: their messages or a generic fixed fallback.

Error messages MUST appear in an `aria-live` / `role="alert"` region.

#### Scenario: API 400 shows fixed fallback and preserves input

- GIVEN the user submitted a movement and the server returned 400 (no body)
- WHEN `onError` runs
- THEN the fixed fallback error message is shown in the alert region
- AND every field (`tipo`, `fecha`, `descripcion`, `monto`, `bucket`, `categoriaId`) retains its value
- AND the form is NOT cleared

#### Scenario: 401 shows fixed session message and preserves input

- GIVEN the server returned 401
- WHEN `onError` runs
- THEN a fixed authentication-error message is shown
- AND all field values are preserved

#### Scenario: Input is preserved across a retry cycle

- GIVEN an error occurred on a first submit attempt
- WHEN the user corrects one field and submits again
- THEN the previously-filled fields still hold their values
- AND only the corrected field changed

---

### Requirement: WEB-REG-09 — Demo session disables the form completely

When `esDemo=true`, the system MUST disable all form fields and the submit button and
MUST display a demo notice (following the `NuevaCategoriaForm` precedent). No request
MUST be issued from a demo session under any circumstances.

#### Scenario: Demo session shows disabled form with notice

- GIVEN `esDemo=true`
- WHEN `RegistrarMovimientoForm` renders
- THEN all inputs and the submit button are disabled
- AND a `role="note"` demo notice is visible

#### Scenario: Demo session never sends a request

- GIVEN `esDemo=true`
- WHEN the submit button is somehow activated
- THEN no `POST /api/movimientos` request is sent

---

### Requirement: WEB-REG-10 — 201 response validated by `esRegistrarMovimientoManualDto`

The `esRegistrarMovimientoManualDto` runtime guard MUST verify that the 201 response
contains all eight expected fields: `id`, `fecha` (ISO-8601 UTC timestamp string — the backend always returns a full timestamp, not a short date), `descripcion`,
`cargo` (money string), `abono` (money string), `bucket`, `categoriaId` (string or null),
and `origen` equal to `"Manual"`. The guard checks `fecha` via `esFechaValida` (parseability — no strict short-date format requirement). A response failing this guard MUST be treated as an
error and MUST NOT trigger the success confirmation flow.

> **Note — two different `fecha` shapes:** the INPUT `fecha` (the form field, sent to the backend) is a short date `YYYY-MM-DD`; the RESPONSE `fecha` (this guard's subject) is a full ISO-8601 UTC timestamp (e.g. `2026-08-22T14:30:00.000Z`). `esFechaValida` checks parseability only and accepts both.

#### Scenario: Canonical 201 response passes the guard

- GIVEN the backend returns 201 with all eight fields and `origen: "Manual"`
- WHEN `esRegistrarMovimientoManualDto` evaluates the response
- THEN the guard returns true and the success flow executes

#### Scenario: Malformed 201 response fails the guard

- GIVEN the backend returns 201 with `origen` missing or `cargo` absent
- WHEN `esRegistrarMovimientoManualDto` evaluates the response
- THEN the guard returns false
- AND the error path executes instead of the confirmation flow

---

### Requirement: WEB-REG-11 — Accessibility: associated labels, cascade focus, a11y ESLint enforcement

Every form field MUST have an associated `<label>` reachable via `getByLabelText`.
When the Gasto cascade appears (the bucket select newly rendered; the categoría select rendered disabled until a bucket is chosen), focus
management MUST ensure the first newly-revealed control receives focus or is announced
by a live region. Confirmation and error messages MUST use `aria-live` / `role="alert"`
or `role="status"` as appropriate. The new files (`registrar.tsx` and
`RegistrarMovimientoForm.tsx`) MUST have zero `jsx-a11y` errors under the scoped
ERROR-level ESLint block added to `apps/web/eslint.config.js`.

#### Scenario: Every field has an associated label

- GIVEN the form renders with `tipo=Gasto` (all fields visible)
- WHEN labels are queried via `getByLabelText`
- THEN each of `tipo`, `fecha`, `descripcion`, `monto`, `bucket`, `categoriaId` resolves to its control

#### Scenario: Cascade appearance is announced or focused

- GIVEN `tipo=Ingreso` (no cascade)
- WHEN the user switches to `tipo=Gasto`
- THEN the bucket select receives focus or an `aria-live` announcement alerts its appearance
- AND a screen reader user can reach the bucket select without manual search

#### Scenario: jsx-a11y ESLint passes clean for the new files

- GIVEN `registrar.tsx` and `RegistrarMovimientoForm.tsx` exist and are linted
- WHEN `eslint` runs with the scoped ERROR-level `jsx-a11y` block
- THEN zero a11y errors are reported for those files

---

### Requirement: WEB-REG-12 — `/subir` flow is untouched; regression guard

The upload route (`/subir`), its components (`SubirCartola.tsx`), its hook
(`useIngesta` / `useCommitIngesta`), and its nav item ("Subir nuevo archivo") MUST remain
behaviorally unchanged. US-060 adds a sibling nav item only.

#### Scenario: /subir upload flow behavior is unchanged

- GIVEN a user on `/subir` performing a cartola upload
- WHEN the complete upload flow executes
- THEN behavior is identical to before US-060 (same state transitions, same request shapes, same outcomes)
- AND no component from `/registrar` or `RegistrarMovimientoForm` is imported by the `/subir` path

---

## ADR-024 Boundary (non-negotiable)

The client MUST NOT implement any of the following:
- Ingreso auto-classification (`bucket=Ingreso`, `categoriaId=null` derivation).
- Gasto catalog/bucket validation logic.
- Money arithmetic, amount formatting as a computation (display-only `formatearMontoCLP` is allowed).
- Origin marker assignment.

All business logic comes exclusively from the backend. The client collects four type-first
fields and transmits the correct discriminated-union variant.

---

## Client Consumers

- **Web UI (US-060)** — `RegistrarMovimientoForm` (`apps/web/src/components/RegistrarMovimientoForm.tsx`) at `/registrar` is the first consumer of `POST /api/movimientos`; deployed at main `110407f3` (2026-08-22). Specification at `openspec/specs/web-registro-manual/spec.md`.
