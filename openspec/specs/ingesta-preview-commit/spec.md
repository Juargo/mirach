# Ingesta Preview + Commit Specification

## Purpose

Split the cartola import from one shot into two explicit backend steps:

1. **Preview** (`POST /api/ingestas/preview`) — returns the full parsed result
   with per-row dedup status and suggested classification, and **writes
   nothing** (no `Account`, `Ingesta`, or `Transaccion` row).
2. **Commit** (`POST /api/ingestas/commit`) — the only step that persists;
   accepts a per-row classification-edits overlay, re-runs dedup against the
   current DB, and registers historial atomically.

The existing one-shot `POST /api/ingestas` is marked `deprecated: true` in
`openapi.json` and remains live and behaviorally unchanged until US-061.
No schema migration. Backend only.

---

## Requirements

### Requirement: PREV-EXT-01 — Preview returns the full row set with per-row dedup status and suggested classification (CA-01, CA-03)

`POST /api/ingestas/preview` MUST return every parsed row (the 50-row
`PREVIEW_SAMPLE_MAX` cap is lifted for this endpoint), each carrying:

- `rowIndex: number` — zero-based index into the re-parsed row set; stable for
  a given file bytes + server parse run; used by the commit overlay.
- `fecha`, `descripcion`, `cargo: string`, `abono: string` — canonical fields,
  `cargo`/`abono` as BigInt-safe strings.
- `esDuplicado: boolean` — `true` when the natural key
  (`fecha + descripcion + cargo + abono`) already exists for the caller's
  account in the current DB state.
- `sugerido: { bucket: string, categoriaId: string | null } | null` —
  classification drawn from the **caller's own catalog** (ADR-036/037) using
  the existing categorization logic. `categoriaId: null` inside a non-null
  `sugerido` means the bucket is determined but no user-editable catalog
  category applies (the `Ingreso` case: `{ bucket: 'Ingreso', categoriaId: null }`).
  `sugerido: null` means no pattern matched and the row is not an `Ingreso`
  (no classification available). Backend states the classification; the client
  must not re-derive the Ingreso rule (ADR-024).

The response MUST also carry an aggregate `resumen` object:

- `resumen.totalFilas: number` — total rows in the normalized set (same as
  `estructura.totalFilasDatos`).
- `resumen.duplicadosDetectados: number` — count of rows where `esDuplicado`
  is `true`.
- `resumen.nuevas: number` — `totalFilas − duplicadosDetectados`.

> **Note — backward-compatibility shim (product decision 2026-08-21, removed by
> US-061):** the preview reshape is ADDITIVE, not a rename. The response MUST
> ALSO carry the deprecated legacy shape so shipped clients keep working: a
> `estructura: { totalFilasDatos: number }` object (mirror of
> `resumen.totalFilas`) and a `muestra` array of the FIRST 50 rows in the old
> 4-field shape (`{ fecha, descripcion, cargo, abono }` only — no
> `rowIndex`/`esDuplicado`/`sugerido`). The canonical shape is `resumen` +
> `filas`; `estructura` + `muestra` are deprecated and removed by US-061
> alongside the one-shot endpoint.

Preview MUST acquire `userId` from the authenticated session to scope both the
dedup lookup and the catalog query.

#### Scenario: Preview with a new account returns all rows, zero duplicates, and suggestions

- GIVEN a valid BancoEstado `.xlsx` cartola with 120 data rows
- AND the caller has never imported from BancoEstado before (no existing
  `Account` for this `userId` + bank)
- AND the caller's catalog has patterns that match 80 of the 120 rows
- WHEN the caller calls `POST /api/ingestas/preview`
- THEN the response is 200 with exactly 120 entries in `filas`
- AND every `filas[i].esDuplicado` is `false`
- AND `resumen.duplicadosDetectados` is 0 and `resumen.nuevas` is 120
- AND 80 entries have a non-null `sugerido` and 40 have `sugerido: null`
- AND no `Account`, `Ingesta`, or `Transaccion` row is created

#### Scenario: Preview with a partially-imported account reports per-row dedup status

- GIVEN the caller has a BancoEstado `Account` with 30 existing transactions
- AND an incoming cartola has 50 rows, 20 of which match existing natural keys
- WHEN the caller calls `POST /api/ingestas/preview`
- THEN `filas` has 50 entries
- AND exactly 20 entries have `esDuplicado: true`
- AND `resumen.duplicadosDetectados` is 20 and `resumen.nuevas` is 30
- AND no row is written to the DB

#### Scenario: Dedup lookup is scoped to the caller's own account (user isolation)

- GIVEN user A has a BancoEstado transaction with natural key K
- AND user B uploads a cartola that contains a row with the same natural key K
- WHEN user B calls `POST /api/ingestas/preview`
- THEN `esDuplicado` is `false` for that row in user B's response
- AND user A's data is not read, modified, or exposed

---

### Requirement: PREV-EXT-02 — Preview uses a read-only account lookup; no write capability (CA-04)

When scoping the dedup query, preview MUST resolve the caller's `Account` via a
**read-only port** (`findByBanco(userId, banco) → accountId | null`).

- When `findByBanco` returns `null` (first import from this bank for this
  user), preview MUST treat `duplicadosDetectados` as 0 — no account, no prior
  transactions, nothing to compare — and MUST NOT create an `Account` row.
- The composition helper `crearPreviewIngesta(...)` MUST NOT accept any
  write-capable dependency; the no-write guarantee is enforced **by
  construction**, not only at runtime.

#### Scenario: First import from an unseen bank creates no Account row

- GIVEN the caller has no existing `Account` for the bank in the uploaded file
- WHEN the caller calls `POST /api/ingestas/preview` with a valid cartola
- THEN the response is 200 with `resumen.duplicadosDetectados: 0`
- AND zero `Account` rows exist for that `userId` + bank after the call

#### Scenario: Repeated previews never accumulate database rows

- GIVEN a valid cartola for a bank/account the caller has never imported
- WHEN the caller calls `POST /api/ingestas/preview` three times with the same
  file
- THEN after all three calls, zero `Account`, `Ingesta`, or `Transaccion` rows
  exist attributable to these calls

---

### Requirement: PREV-EXT-03 — Preview error contract is unchanged; amounts stay scrubbed (CA-04)

Preview MUST surface the existing domain errors (`ExtensionNoPermitidaError`,
`BancoNoReconocidoError`, `EstructuraInvalidaError`,
`NormalizacionInvalidaError`, `PdfInvalidoError`, `PdfSinTextoError`,
`EstructuraPdfInvalidaError`, `RangoFechasInvalidoError`) as HTTP 400 with a
fixed, descriptive message containing no raw amounts read from the file.
Every `cargo` and `abono` field in the 200 response MUST be a JSON string, never
a JSON number.

#### Scenario: Invalid bank returns 400 with a scrubbed message

- GIVEN a file whose layout matches no known bank strategy
- WHEN the caller calls `POST /api/ingestas/preview`
- THEN the response is 400 with a fixed message identifying the failure
  category and no raw file content or amounts

#### Scenario: Successful preview amounts are always strings

- GIVEN a valid cartola
- WHEN the caller calls `POST /api/ingestas/preview`
- THEN every `filas[i].cargo` and `filas[i].abono` in the 200 response is a
  JSON string (never a JSON number)

---

### Requirement: CMT-01 — Commit endpoint accepts file + edits overlay; applies overlay before persisting (CA-02)

`POST /api/ingestas/commit` MUST accept a `multipart/form-data` request with:

- `file`: the same cartola file the user previewed (`.xlsx` or `.pdf`).
- `edits`: a JSON string field carrying
  `[{ rowIndex: number, categoriaId: string | null }]`.

The server MUST:

1. Re-parse the file server-side (server stays authoritative for all money and
   identity fields).
2. Re-run dedup against the **current** DB state (see CMT-02).
3. Apply the edits overlay over the auto-classification result: for each entry
   in `edits`, the named `rowIndex` receives `categoriaId` from the overlay
   instead of the auto-classified value. Rows with no overlay entry retain the
   auto-classified result (degradable-island semantics unchanged).
4. Persist only after the overlay is applied.

The overlay can only reassign classification. It cannot alter `fecha`,
`descripcion`, `cargo`, `abono`, or `rowIndex` (those are parsed from the file).

#### Scenario: Overlay reclassifies named rows before persistence

- GIVEN a valid cartola with 10 rows where auto-classification assigns
  `categoriaId: "cat_auto"` to row 3
- AND the caller sends `edits: [{ "rowIndex": 3, "categoriaId": "cat_manual" }]`
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the persisted `Transaccion` for row 3 has `categoriaId: "cat_manual"`
- AND all other rows retain their auto-classified values

#### Scenario: Rows with no overlay entry keep auto-classification

- GIVEN a valid cartola with 10 rows
- AND the caller sends `edits: [{ "rowIndex": 2, "categoriaId": "cat_X" }]`
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN only row 2's classification is overridden; rows 0, 1, 3–9 use
  auto-classification (or `null` if no pattern matched)

#### Scenario: Malformed edits JSON returns 400 with amounts scrubbed

- GIVEN the caller sends `edits` as an invalid JSON string
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response is 400 with a descriptive message and no raw amounts from
  the file

#### Scenario: Out-of-range rowIndex in overlay returns 400

- GIVEN the re-parsed cartola produces 10 rows (indices 0–9)
- AND the caller sends `edits: [{ "rowIndex": 15, "categoriaId": "cat_X" }]`
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response is 400 with a descriptive message identifying the invalid
  index; no rows are persisted

---

### Requirement: CMT-02 — Commit re-runs dedup; new duplicates are omitted and reported, never aborting (CA-03)

At commit time, the server MUST re-run the same natural-key dedup
(`fecha + descripcion + cargo + abono` per `accountId`) against the **current
DB state** — the state may differ from the preview call (another commit may have
run between preview and commit).

Rows that are duplicates at commit time MUST be **omitted** from the persisted
set and their count reported as `duplicadosOmitidos` in the response. A commit
MUST NOT abort because of duplicates; it always persists the non-duplicate
subset.

#### Scenario: New duplicates detected at commit are omitted and counted

- GIVEN the caller previewed a cartola with 0 duplicates
- AND another import of the same account committed 5 of those rows between the
  preview and commit calls
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response reports `duplicadosOmitidos: 5`
- AND those 5 rows are not persisted
- AND the remaining rows are persisted normally (commit does not abort)

#### Scenario: All rows duplicate at commit still succeeds

- GIVEN the caller commits a cartola where all rows already exist in the DB
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response is 200 with `duplicadosOmitidos` equal to the total row
  count and `totalTransacciones: 0`
- AND the commit does not return an error

---

### Requirement: CMT-03 — Commit rejects cross-tenant categoriaId values (RNF-SEC-006)

Before persisting, commit MUST validate that every `categoriaId` in the edits
overlay belongs to the **caller's own catalog** (scoped by `userId`, ADR-036).
A `categoriaId` from another user's catalog MUST be rejected.

#### Scenario: Cross-tenant categoriaId is rejected

- GIVEN user A has a `Categoria` with id `cat_A` (belongs to user A's catalog)
- AND user B sends `edits: [{ "rowIndex": 0, "categoriaId": "cat_A" }]` in a
  commit request
- WHEN user B's commit is processed
- THEN the response is 400 identifying the invalid `categoriaId`
- AND no rows are persisted for user B in that request

#### Scenario: Valid own categoriaId is accepted

- GIVEN the caller has a `Categoria` with id `cat_own` in their own catalog
- AND the caller sends `edits: [{ "rowIndex": 0, "categoriaId": "cat_own" }]`
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the overlay is applied and the commit proceeds normally

---

### Requirement: CMT-04 — Commit persists atomically and registers historial (CA-06, US-004)

Commit MUST persist the `Ingesta` record and all its `Transaccion` rows in a
single atomic operation via `IIngestaRepository.persistirProcesada()` (the
existing US-004 historial path). If any part of the write fails, nothing is
committed — no partial `Ingesta` with missing `Transaccion` rows.

All reads and writes at commit are scoped by `userId` (RNF-SEC-006). User B
cannot commit into or read user A's data.

#### Scenario: Commit registers historial atomically

- GIVEN a valid cartola with 5 non-duplicate rows and a valid edits overlay
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response is 200 with the persisted `ingestaId`
- AND the `Ingesta` row and all 5 `Transaccion` rows exist and are associated
  with the caller's `userId`
- AND the `Ingesta` is registered in historial (US-004)

#### Scenario: User B cannot commit into user A's data (cross-tenant isolation)

- GIVEN user A has an `Account` and transaction history
- WHEN user B calls `POST /api/ingestas/commit` with a cartola that resolves
  to user B's own account
- THEN all persisted rows belong exclusively to user B's `userId`
- AND user A's `Account`, `Ingesta`, or `Transaccion` rows are not read,
  modified, or exposed

---

### Requirement: CMT-05 — Commit response carries commit-specific fields (CA-02)

The commit response MUST include:

- `ingestaId: string`
- `totalTransacciones: number` — count of rows actually persisted (excluding
  duplicates omitted at commit).
- `duplicadosOmitidos: number` — count of rows omitted because they were
  duplicates at commit time.
- `transacciones[]` — the persisted rows with their final `bucket` and
  `categoriaId`.

Amounts in `transacciones[]` MUST be BigInt-safe strings, matching the existing
`TransaccionResponseDto` convention.

#### Scenario: Response correctly reflects persisted vs omitted counts

- GIVEN a cartola with 10 rows where 3 are duplicate at commit time
- WHEN the caller calls `POST /api/ingestas/commit`
- THEN the response has `totalTransacciones: 7`, `duplicadosOmitidos: 3`, and
  `transacciones` with 7 entries

---

### Requirement: DEP-01 — One-shot `POST /api/ingestas` is deprecated in openapi.json but behaviorally unchanged (CA-05)

`POST /api/ingestas` MUST be annotated `deprecated: true` in `openapi.json`.
Its request/response contract, routing, middleware chain, and pipeline behavior
MUST remain identical to today. Mobile callers (ADR-026) continue to use it
until US-061. No feature flag, env toggle, or dual-write logic branch is
introduced.

A transition note MUST be recorded (in the ADR table row for ADR-026 or the
ingesta runbook) stating: deprecated at US-057, physical removal tracked by
US-061.

#### Scenario: Deprecated one-shot still imports correctly (regression guard)

- GIVEN a mobile caller with a valid session and API key
- WHEN the caller calls `POST /api/ingestas` with a valid cartola (unchanged
  flow)
- THEN the response is the existing `IngestaResponseDto` shape with persisted
  `ingestaId`, `totalTransacciones`, `duplicadosOmitidos`, and categorization
- AND the `Ingesta` + `Transaccion` rows exist in the DB

#### Scenario: openapi.json marks the one-shot as deprecated

- GIVEN the current `openapi.json`
- WHEN the spec file is inspected for `POST /api/ingestas`
- THEN the operation object includes `"deprecated": true`
- AND `POST /api/ingestas/preview` and `POST /api/ingestas/commit` are present
  as non-deprecated operations

---

### Requirement: CONTRACT-01 — openapi.json reflects the extended preview, the new commit, and the deprecated one-shot (CA-06, ADR-011)

`openapi.json` (and its TypeScript schema source) MUST be updated to reflect:

- **Extended `PreviewIngestaResponse`**: `resumen` aggregate object; `filas`
  array (replaces `muestra`) with per-row `rowIndex`, `esDuplicado`, and
  `sugerido`; all amounts as strings.
- **New `CommitIngestaRequest`**: multipart schema documenting the `file` field
  and the `edits` JSON string field.
- **New `CommitIngestaResponse`**: `ingestaId`, `totalTransacciones`,
  `duplicadosOmitidos`, `transacciones[]` with BigInt-safe string amounts.
- **Deprecated `POST /api/ingestas`**: `deprecated: true` annotation.

#### Scenario: openapi.json is consistent with runtime behavior

- GIVEN the updated `openapi.json` and the running API
- WHEN a contract check is run (CI)
- THEN the preview, commit, and deprecated one-shot operations in the spec
  match the actual endpoints' accepted and returned shapes

---

## User Data Isolation — MODIFIED (RNF-SEC-006)

This spec extends the existing user-data-isolation requirement from `user-data-isolation/spec.md`:

- **Preview scope**: All reads (dedup lookup, account lookup, catalog lookup) are scoped by `userId`. User B's preview cannot observe user A's transactions.
- **Commit scope**: All reads and writes are scoped by `userId`. User B cannot commit into user A's account, category, or transaction data.
- **Cross-tenant categoriaId rejection** (new): Commit validates that every overlay `categoriaId` belongs to the caller's own catalog. A `categoriaId` from another user's catalog is rejected with a 400.

---

## Out of Scope

- **Web UI (US-059) and mobile UI (US-061)** — this change ships the backend
  contract only; client consumption is a separate story.
- **Bank parsing strategies** — no change to detection, validation, or
  normalization for any bank. Preview and commit reuse the existing pipeline.
- **Row exclusion** — the edits overlay can only reassign
  `bucket`/`categoriaId`. A "skip this row" capability is explicitly deferred.
- **Editing amounts, dates, or descriptions** — server-parsed fields are
  authoritative; the overlay is classification-only.
- **Physical removal of `POST /api/ingestas`** — deprecation only; removal is
  US-061.
- **Server-side staging or `PREVIEW` ingesta state** — no new `EstadoIngesta`
  value, no TTL cleanup job, no schema migration.
- **CLI preview** — the CLI keeps its single-shot flow.

---

## Testing Emphasis (ADR-014/015 alignment)

- **No-write guarantee (unit)**: a unit test asserts `crearPreviewIngesta()`
  has no write-capable dependency in its constructed type; a separate unit test
  calls preview against a fake filesystem and asserts zero writes to any
  repository mock.
- **Money exactness (unit)**: BigInt-safe string assertions on every
  `cargo`/`abono` field in preview response and commit response; BigInt-exact
  dedup comparison in the domain layer.
- **Cross-tenant categoriaId rejection (unit/integration)**: overlay validation
  rejects a `categoriaId` that belongs to a different `userId`; no rows
  persisted on rejection.
- **Dedup at commit (integration)**: integration test against a local ephemeral
  DB (`local-test-db.md`) that commits between preview and commit calls and
  verifies `duplicadosOmitidos` reflects the new state; also verifies commit
  does not abort.
- **User isolation (integration)**: integration test proves user B's commit
  cannot touch user A's `Account`, `Ingesta`, or `Transaccion` rows, and that
  user B's dedup lookup does not read user A's transactions.
- **Regression guard (integration)**: `POST /api/ingestas` (one-shot) produces
  the same `IngestaResponseDto` shape and behavior as before this change.
- **openapi.json contract check (CI)**: the schema source and the generated
  `openapi.json` are consistent; preview, commit, and deprecated one-shot
  operations are all present with the correct shapes and `deprecated` annotation.
