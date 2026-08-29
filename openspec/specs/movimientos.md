# Spec: Correction path for committed manual movements

**Change**: `correccion-movimientos-manuales`
**Type**: New capability — `DELETE /api/movimientos/:id` (backend) + delete affordance (web)
**Depends on**: `origen='Manual'` + CHECK constraint (ADR-039); `EliminarIngesta` pattern (US-018); `MENSAJE_PERMANENCIA` (US-058/060 web form)

## Purpose

Adds a correction path for manual movements: a user may permanently delete a
`Transaccion` they typed by hand (`origen='Manual'`); ingesta-born rows remain
untouched (delete-the-ingesta stays the only path for those). No existing
`openspec/specs/` entry covers deletion, so this is a full spec.

## Requirements

### Requirement: DEL-01 — Scoped delete of an owned manual movement

The system MUST expose `DELETE /api/movimientos/:id`. The persistence layer
MUST gate the delete by `{ id, origen: 'Manual', account: { userId } }` in the
WHERE clause (not an application-level check after a separate read). A
successful delete MUST return 204 and remove exactly one row, with no cascade.

#### Scenario: Owner deletes their own manual movement

- GIVEN a manual movement owned by user A
- WHEN user A calls `DELETE /api/movimientos/:id` for that row
- THEN the response is 204 and the row no longer exists
- AND the next read of resumen/semáforo/detalle-bucket reflects the removal with no cache invalidation needed

### Requirement: DEL-02 — Merged 404 anti-enumeration

Absent id, another user's row, and an ingesta-born row (owned but not manual)
MUST all produce the identical 404 response. The system MUST NOT return a
distinct error for "not manual" — that would leak provenance.

#### Scenario: Non-existent id

- GIVEN no `Transaccion` with the given id exists
- WHEN any authenticated user calls `DELETE /api/movimientos/:id`
- THEN the response is 404 with the standard merged body

#### Scenario: Another user's row

- GIVEN a manual movement owned by user B
- WHEN user A calls `DELETE /api/movimientos/:id` for that row
- THEN the response is 404, identical to the non-existent-id case, and the row is untouched

#### Scenario: Own ingesta-born row

- GIVEN a `Transaccion` owned by user A with `origen != 'Manual'`
- WHEN user A calls `DELETE /api/movimientos/:id` for that row
- THEN the response is 404, identical in shape to the other two cases, and the row is untouched

#### Scenario: Idempotence — repeat delete of the same id

- GIVEN user A already deleted their own manual movement successfully
- WHEN user A calls `DELETE /api/movimientos/:id` again for the same id
- THEN the response is 404

### Requirement: DEL-03 — Demo sessions never persist a deletion

A demo session MUST be rejected before the writer is reached, mirroring
`EliminarIngestaUseCase`. The response MUST be 403 `DEMO_SOLO_LECTURA`, routed
through `responderErrorTraducido`, and MUST log the gate trip.

#### Scenario: Demo session attempts delete

- GIVEN an authenticated demo session and a manual movement it would otherwise own
- WHEN it calls `DELETE /api/movimientos/:id`
- THEN the response is 403 `DEMO_SOLO_LECTURA`, the row is untouched, and the gate trip is logged

### Requirement: DEL-04 — Contract documents the endpoint

`openapi.json` MUST document `DELETE /api/movimientos/:id` with 204, 401, 403,
and 404 responses (ADR-011). CI `openapi:check` MUST pass.

#### Scenario: Contract check is green

- GIVEN the updated `openapi.json`
- WHEN `openapi:check` runs in CI
- THEN it passes with `DELETE /api/movimientos/:id` present and all four status codes documented

### Requirement: WEB-DEL-01 — Delete affordance on manual rows only, both list surfaces

Both `IngresosMesTable` and the gasto surface (`BucketDetalleMesPage` /
`GrupoMovimientos`) MUST render a per-row delete control only on rows with
`origen='Manual'`; non-manual rows MUST show no control. If the gasto-side
view-model does not currently carry an origen signal, this change MUST add it.
The confirm dialog MUST disclose the row's `fecha`, `monto`, and
`descripcion`. On error the dialog MUST stay open with the error shown
(retry). On success the row unmounts and the parent list's live region
announces the outcome. In a demo session the control MUST render disabled
with an explanatory note.

#### Scenario: Affordance appears only on manual rows, on both surfaces

- GIVEN a list (ingresos or gastos) containing both a manual row and a non-manual row
- WHEN the list renders
- THEN the manual row shows a delete control and the non-manual row does not, on both surfaces

#### Scenario: Confirm dialog discloses the target row

- GIVEN the user opens the delete control on a manual row
- WHEN the confirm dialog renders
- THEN it shows that row's fecha, monto, and descripcion before confirming

#### Scenario: Error keeps the dialog open for retry

- GIVEN the user confirms deletion and the request fails
- WHEN the error response arrives
- THEN the dialog stays open, shows the error, and the row is not removed

#### Scenario: Success is announced via the list's live region

- GIVEN the user confirms deletion and the request succeeds
- WHEN the row unmounts
- THEN the parent list's live region announces the successful removal

#### Scenario: Demo mode disables the control

- GIVEN a demo session viewing a manual row
- WHEN the list renders
- THEN the delete control is disabled and shows a note explaining why

### Requirement: WEB-DEL-02 — Permanence copy is corrected at both render sites

`MENSAJE_PERMANENCIA` MUST be rewritten so it no longer promises that a manual
movement cannot be deleted; it MUST continue to state that editing is not
possible. Both render sites (the always-visible note and the confirmation
dialog) MUST use the same corrected string, and a unit test MUST pin it.

#### Scenario: Copy is accurate at both sites

- GIVEN the always-visible note and the confirmation dialog
- WHEN their text is inspected
- THEN neither claims a manual movement cannot be deleted, and both still state it cannot be edited

### Requirement: DEL-05 — Ownership isolation and the not-manual negative are integration-verified

Because the `origen: 'Manual'` WHERE clause is the entire safety boundary
(ADR-015), cross-user deletion attempts and deletion attempts against
ingesta-born rows MUST be covered by integration tests against a real
database, not unit mocks.

#### Scenario: Cross-user delete attempt verified against real DB

- GIVEN a manual movement owned by user B in a real test database
- WHEN user A's integration test calls `DELETE /api/movimientos/:id` for it
- THEN the test asserts a 404 response and that the row still exists in the database

#### Scenario: Ingesta-born row delete attempt verified against real DB

- GIVEN an ingesta-born row owned by user A in a real test database
- WHEN user A's integration test calls `DELETE /api/movimientos/:id` for it
- THEN the test asserts a 404 response and that the row still exists in the database

## Testing Emphasis (ADR-014/015)

| Layer | Focus |
|-------|-------|
| Unit — domain/use case | Demo gate short-circuits before writer; error mapping to `DEMO_SOLO_LECTURA` |
| Unit — web | Control renders only on manual rows (both surfaces); dialog discloses fields; error keeps dialog open; success announcement; demo-disabled state; `MENSAJE_PERMANENCIA` string pinned at both sites |
| Integration | Ownership isolation (DEL-05); not-manual negative (DEL-05); merged 404 shape across all three cases; demo gate against real session |
| Contract | `openapi.json` includes `DELETE /api/movimientos/:id` with 204/401/403/404; `openapi:check` green |
