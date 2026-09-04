# Ingesta Management Specification (apps/api + apps/web)

## Purpose

Comprehensive specification for managing user ingestas across their complete lifecycle:
- Delete operations with atomic cascade semantics (US-018)
- Listing all terminal ingestas — successful (`PROCESADA`) and failed (`FALLIDA`) (US-004 + US-018)
- Delete affordances gated to `PROCESADA` rows only (US-004 + US-018)
- Early pipeline failures recorded with direct userId isolation (US-004)

The system tracks every terminal upload attempt (success or failure) without intermediate states. `CANCELADA` does not exist in `EstadoIngesta` and stays out of scope.

## Requirements

### Requirement: ING-01 — Authenticated cascade delete removes an ingesta and its transacciones atomically

The system MUST expose `DELETE /api/ingestas/:id`, guarded by the same `ApiKeyGuard` + `SessionGuard` chain as other data routes. On success it MUST delete the ingesta row and ALL of its `Transaccion` rows inside a single atomic `$transaction`; partial deletion MUST NOT be observable.

#### Scenario: Owner deletes an ingesta and derived views recalculate

- GIVEN an authenticated user who owns ingesta I with N `Transaccion` rows
- WHEN they call `DELETE /api/ingestas/I`
- THEN the response is 200/204, and I plus its N rows no longer exist
- AND a subsequent `GET /api/resumen` for the affected period recalculates without them

#### Scenario: A simulated mid-delete failure leaves nothing deleted

- GIVEN a delete that fails partway through the transaction (simulated DB error)
- WHEN the failure occurs
- THEN neither the ingesta nor any `Transaccion` row is deleted (all-or-nothing)

### Requirement: ING-02 — Delete is userId-isolated and anti-enumeration (RNF-SEC-006)

The delete endpoint MUST scope BOTH the child and parent delete statements by the caller's `userId` (for `PROCESADA` rows scoped via `Ingesta.userId` directly, legacy rows via `Ingesta.accountId → Account.userId`), per RNF-SEC-006. A foreign-owned id and a nonexistent id MUST both return the IDENTICAL 404 response, with no field distinguishing "not found" from "not yours."

#### Scenario: A foreign ingesta cannot be deleted

- GIVEN user A and ingesta I owned by user B
- WHEN user A calls `DELETE /api/ingestas/I`
- THEN the response is 404 and I plus all of B's `Transaccion` rows remain intact

#### Scenario: A nonexistent id returns the same 404 shape

- GIVEN an authenticated user and an id that does not exist
- WHEN they call `DELETE /api/ingestas/that-id`
- THEN the response is 404, identical in shape to the foreign-ingesta case

### Requirement: ING-03 — List endpoint returns all the caller's ingestas, success and failure, with outcome detail

The system MUST expose `GET /api/ingestas`, guarded by the same auth chain, returning one row per ingesta owned by the caller, ordered by `creadoEn` descending, regardless of `estado` (`PROCESADA` or `FALLIDA` only — `CANCELADA` MUST NOT appear, it is not a valid enum value). Each row MUST include `id`, `nombreArchivo`, `estado`, `banco` (nullable), `fecha` (nullable), `totalTransacciones` (set for `PROCESADA`), and `motivoFallo` (set for `FALLIDA`). Rows owned by other users MUST NOT appear (RNF-SEC-006), scoped by `Ingesta.userId` directly.

#### Scenario: History lists successes and failures in chronological order (CA-01, CA-02)

- GIVEN user A has one early-failed upload, one late-failed upload, and one successful upload
- WHEN user A calls `GET /api/ingestas`
- THEN all three rows return ordered by upload time descending, each labeled `estado` exitoso/fallido, and no row ever shows `CANCELADA`

#### Scenario: A user lists only their own ingestas

- GIVEN user A has 2 ingestas (any estado) and user B has 1
- WHEN user A calls `GET /api/ingestas`
- THEN exactly A's 2 rows are returned

#### Scenario: A successful ingesta reports its transaction count

- GIVEN a `PROCESADA` ingesta with N transacciones
- WHEN it is listed
- THEN `totalTransacciones` equals N

#### Scenario: A failed ingesta reports its failure reason instead of a count

- GIVEN a `FALLIDA` ingesta
- WHEN it is listed
- THEN `motivoFallo` is a non-empty string and `totalTransacciones` is 0/null

### Requirement: ING-04 — Both endpoints require an active session

`DELETE /api/ingestas/:id` and `GET /api/ingestas` MUST reject requests lacking a valid API key or session with the same 401 contract as other data endpoints, evaluated BEFORE any ownership resolution.

#### Scenario: An unauthenticated request is rejected before ownership is checked

- GIVEN no valid session/API key
- WHEN either endpoint is called
- THEN the response is 401 and no ingesta/`Transaccion` row is read or deleted

### Requirement: ING-05 — Web delete affordance is gated to PROCESADA rows; confirmation modal shows impact count

The delete action (button + confirmation modal) MUST be offered **only** for `PROCESADA` rows. `FALLIDA` rows MUST render `nombreArchivo`, `fecha`, and `motivoFallo`, and MUST NOT render a delete control — deleting a failed upload attempt is out of scope this sprint. For a `PROCESADA` row, clicking delete MUST open an accessible `role="alertdialog"` stating the number of transactions that will be deleted (always `N > 0`, since `PROCESADA ⟹ accountId NOT NULL` and a resolved `totalTransacciones`). Escape/Cancelar MUST close it without deleting and return focus to the trigger. Confirmar MUST issue the DELETE and refresh the list and derived views.

#### Scenario: FALLIDA rows render no delete control

- GIVEN a `FALLIDA` ingesta with `nombreArchivo`, `fecha`, and `motivoFallo`
- WHEN the history list renders the row
- THEN `nombreArchivo`, `fecha`, and `motivoFallo` are shown
- AND no delete button/control is rendered for that row

#### Scenario: PROCESADA delete flow works with accurate impact count

- GIVEN a `PROCESADA` ingesta with N>0 transacciones
- WHEN the user clicks delete
- THEN the alertdialog opens showing N, and confirming issues the DELETE and refreshes the list

#### Scenario: Cancel returns focus without deleting

- GIVEN the modal is open for an ingesta with N transactions
- WHEN the user presses Escape (or clicks Cancelar)
- THEN the modal closes, no DELETE request is sent, and focus returns to the trigger button

### Requirement: ING-06 — Successful delete invalidates all derived query caches

On a successful delete response, the web client MUST invalidate the TanStack Query cache keys `['resumen']`, `['resumen-anual']`, `['detalle-bucket']`, and `['ingestas']` so every derived view refetches without the deleted rows. A failed delete MUST NOT invalidate any cache key.

#### Scenario: All 4 cache keys are invalidated after a successful delete

- GIVEN a successful `DELETE /api/ingestas/:id` response
- WHEN the mutation's `onSuccess` handler runs
- THEN `['resumen']`, `['resumen-anual']`, `['detalle-bucket']`, and `['ingestas']` are all invalidated

#### Scenario: A failed delete leaves caches untouched

- GIVEN the DELETE request fails (network/500)
- WHEN the mutation's `onError` handler runs
- THEN no cache key is invalidated and the ingesta still appears in the list

### Requirement: ING-07 — Early pipeline failures are recorded with direct userId isolation

The system MUST persist a `FALLIDA` `Ingesta` row for every terminal pipeline failure, including failures before an `Account` is resolved (invalid extension, unrecognized bank). Each such row MUST carry `userId` (NOT NULL, from the authenticated request) directly on `Ingesta`, independent of `accountId`. `accountId`/`banco` MAY be null. `motivoFallo` MUST be set. The invariant `estado = PROCESADA ⟹ accountId IS NOT NULL` MUST hold.

#### Scenario: Unrecognized-bank upload is recorded as FALLIDA

- GIVEN an authenticated user uploads a cartola whose bank cannot be detected
- WHEN the upload completes
- THEN a row exists with `estado=FALLIDA`, `userId` set, `banco=null`, `nombreArchivo` set, and a descriptive `motivoFallo`

#### Scenario: Invalid-extension upload is recorded as FALLIDA

- GIVEN a user uploads a `.docx` file
- WHEN validation rejects it
- THEN a `FALLIDA` row is recorded with `nombreArchivo` and a `motivoFallo` describing the invalid extension

#### Scenario: A successful ingesta always has a resolved account

- GIVEN a `PROCESADA` ingesta
- THEN `accountId` is NOT NULL (enforced in application layer, not a DB CHECK)

### Requirement: ING-08 — Multi-tenant isolation of the ingesta history (RNF-SEC-006)

`GET /api/ingestas` MUST scope exclusively by the caller's own `Ingesta.userId`, for both `PROCESADA` and `FALLIDA` rows, including rows where `accountId` is null.

#### Scenario: A user never sees another user's ingestas, including accountId-null ones

- GIVEN user A has 1 successful and 1 failed ingesta, and user B has 1 failed ingesta with `accountId` null
- WHEN user A calls `GET /api/ingestas` (integration-level test)
- THEN exactly A's 2 rows return; B's row never appears

### Requirement: ING-09 — Stored failure reasons never leak raw monetary amounts

`motivoFallo` MUST NOT contain raw transaction amounts or balances. `ProcessIngestaError` messages MUST interpolate only structural context (file name, bank, column/row labels), never numeric monetary values.

#### Scenario: A structural-validation failure's motivoFallo has no monetary figures

- GIVEN a cartola that fails structure validation on a row containing a real amount
- WHEN the failure is recorded
- THEN `motivoFallo` describes the structural problem and contains no currency-formatted or numeric monetary value from that row

## Non-Goals

- `CANCELADA` / third outcome — not a valid `EstadoIngesta` value, out of scope.
- Revert/undo/re-download the original file.
- Filtros avanzados, búsqueda, paginación.
- Mobile UI for history.
- Deleting a `FALLIDA` row is OUT OF SCOPE this sprint: the delete affordance is gated to `PROCESADA` rows only. Enabling delete for failed attempts is a documented follow-up, not built now.
- Reconciliación de `PENDIENTE` huérfanos (separate follow-up).
- Re-upload/undo/soft-delete/export-before-delete — hard delete only.
- Mobile/CLI delete surface — web only (ADR-010/026 unaffected).
- Batch/multi-select delete — single ingesta per action.
- Column encryption 11.6 trigger — no new PII surface introduced.
