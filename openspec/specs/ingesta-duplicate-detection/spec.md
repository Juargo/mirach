# Ingesta Duplicate Detection Specification

## Purpose

Detect, within the existing single-request ingesta pipeline, transactions that already exist for the target account so that re-uploading a statement never silently duplicates data. The system warns with a count and auto-skips duplicates in the same request; it does not implement a pre-persist cancel gate (see Out of Scope).

## Requirements

### Requirement: Duplicate detection by natural key

The system MUST detect, before persistence, incoming transactions that match an existing transaction on the same `accountId` using the natural key `accountId + fecha + descripcion + cargo + abono`, with exact match on all five fields. `cargo` and `abono` MUST be compared as exact `BigInt` values, never as floating point.

#### Scenario: Different descripcion is not a duplicate

- GIVEN an existing transaction with `fecha=2026-07-01`, `cargo=5000`, `abono=0`, `descripcion="COMPRA A"`
- WHEN a new batch includes a row with the same `accountId`, `fecha`, `cargo`, `abono` but `descripcion="COMPRA B"`
- THEN the new row is NOT treated as a duplicate and IS persisted

#### Scenario: All five fields match is a duplicate

- GIVEN an existing transaction with `accountId=A1`, `fecha=2026-07-01`, `descripcion="COMPRA A"`, `cargo=5000`, `abono=0`
- WHEN a new batch includes a row with the identical values for all five fields
- THEN the row is treated as a duplicate and is NOT persisted

#### Scenario: Money comparison is BigInt-exact

- GIVEN an existing transaction with `cargo=5000`
- WHEN a new batch row is otherwise identical but has `cargo=5001` (differs by 1 minor unit)
- THEN the row is NOT treated as a duplicate and IS persisted

### Requirement: Auto-skip and partial persistence (CA-03)

The system MUST persist only the transactions that are not duplicates ("nuevas") from an incoming batch, and MUST record the count of skipped duplicates on the `Ingesta` record as `duplicadosOmitidos`.

#### Scenario: N of M rows are duplicates

- GIVEN an incoming batch of M transactions where N already exist per the natural key
- WHEN the ingesta is processed
- THEN exactly M−N transactions are persisted
- AND `Ingesta.duplicadosOmitidos` equals N

#### Scenario: All rows are duplicates

- GIVEN an incoming batch where all M transactions already exist per the natural key
- WHEN the ingesta is processed
- THEN 0 new transactions are persisted
- AND the `Ingesta` record is still created/updated with `duplicadosOmitidos = M`
- AND the response reports 0 imported and M omitted

### Requirement: Duplicate count in response (CA-01)

The system MUST report, in the ingesta response, the count of transactions actually persisted (imported) and the count of duplicates omitted. `totalTransacciones` in the response carries its pre-existing meaning (imported count), unchanged; a separate "total incoming" field is NOT part of the response shape, since it would be redundant with `transacciones importadas + duplicadosOmitidos` and is not needed by any consumer.

#### Scenario: Response shape reflects counts

- GIVEN an incoming batch of M transactions where N are duplicates
- WHEN the ingesta completes
- THEN the response includes `totalTransacciones = M - N` (imported count) and `duplicadosOmitidos = N`

### Requirement: No duplicates leaves normal flow unchanged (CA-04)

The system MUST NOT alter existing pipeline behavior, response shape defaults, or emit any warning when an incoming batch contains zero duplicates.

#### Scenario: Zero duplicates

- GIVEN an incoming batch where none of the M transactions already exist for the account
- WHEN the ingesta is processed
- THEN all M transactions are persisted
- AND `duplicadosOmitidos = 0`
- AND no warning is shown

### Requirement: User isolation of duplicate lookups (RNF-SEC-006)

The system MUST scope duplicate lookups to the `accountId` being imported into, and MUST NOT treat a matching transaction under a different user's account as a duplicate.

#### Scenario: Cross-user isolation

- GIVEN user A has a transaction identical in all 5 natural-key fields to a row in user B's incoming batch, but under a different `accountId` (owned by a different `userId`)
- WHEN user B's ingesta is processed
- THEN user B's row is NOT treated as a duplicate and IS persisted
- AND user A's data is not read, modified, or exposed

### Requirement: Performance and read-only guarantee (NFR)

Duplicate detection MUST complete in under 3 seconds for files of up to 10,000 rows, and MUST NOT mutate any pre-existing transaction, account, or ingesta data.

#### Scenario: Bounded lookup performance

- GIVEN an account with existing transaction history and an incoming batch of up to 10,000 rows
- WHEN duplicate detection runs, bounded by `accountId` and the incoming batch's `fecha` range `[min, max]`
- THEN detection completes in under 3 seconds
- AND no existing transaction row is altered or deleted

### Requirement: Accepted limitation — same-day identical transactions

The system MAY treat two genuinely distinct transactions that share identical `accountId + fecha + descripcion + cargo + abono` as a single duplicate, dropping one. This is a documented, stakeholder-accepted MVP limitation, not a defect.

#### Scenario: Two legitimately identical same-day transactions

- GIVEN a user made two real, separate purchases on the same day at the same merchant for the same exact amount, with identical description text
- WHEN both rows are included in an incoming batch matching an already-persisted row, or one duplicates the other within the same batch
- THEN only one of the two is persisted and the other is counted as a duplicate (accepted limitation, no cancellation or merge behavior implied)

## Out of Scope

- **CA-02 literal pre-persist cancel gate**: choosing to cancel the entire import before anything is persisted is NOT implemented here. This change delivers warn + auto-skip in a single request. The cancel/preview round-trip is deferred to **US-003 (Vista previa)**.
- **Full-file hash detection** (whole-file duplicate check) — deferred, not part of this natural-key approach.
- **Merge or update of existing records** on duplicate match — duplicates are only skipped, never merged.
- **Cleanup/backfill of pre-existing duplicates** already in the database — out of scope, no data migration.
- **Mobile ingesta UI** (US-033) — this spec covers backend detection and the web banner only.

## Testing Emphasis (ADR-014/015 alignment)

- **Money exactness (unit)**: BigInt-exact comparison scenarios above are unit-testable in the domain/application layer without a database.
- **User isolation (integration)**: cross-user isolation scenario above requires an integration test against real persistence, verifying `accountId`-scoped queries never leak across `userId`.
