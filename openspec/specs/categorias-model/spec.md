# Categorías Model Specification (apps/api — domain/application)

## Purpose

Introduces a `Categoria` layer between `PatronClasificacion` and
`BucketPresupuesto`: each `Categoria` belongs to exactly one bucket. Each
`Transaccion` MAY carry a `categoriaId` (finer than bucket); `bucketId` stays
the mandatory, always-present source of truth for the 50/30/20 aggregation.
This spec covers the invariant, automatic assignment, the fixed taxonomy, and
the backfill of existing rows. Manual reclassify (write path) is specced in
`categorias-api`; UI in `web-app`.

## Requirements

### Requirement: CAT-01 — A `Categoria` belongs to exactly one bucket

Every `Categoria` MUST reference exactly one `BucketPresupuesto` and inherit
it. A categoría MUST NOT exist without a bucket, and MUST NOT reference more
than one.

#### Scenario: Every seeded categoría has a single bucket

- GIVEN the fixed seed catalog (Supermercado, Combustible, Farmacia, Salud,
  Transporte → Necesidades; Streaming, Delivery → Deseos; Ahorro → Ahorro)
- WHEN the catalog is loaded
- THEN each categoría resolves to exactly one bucket

### Requirement: CAT-02 — `bucketId` is always present and consistent with `categoriaId`

Every `Transaccion` MUST have a `bucketId` (never absent, regardless of
`categoriaId`) — it remains the source of truth for 50/30/20 aggregation.
Whenever `categoriaId` is set (non-null), the transaction's `bucketId` MUST
equal that categoría's bucket. The system MUST derive `bucketId` from the
assigned categoría — it MUST NOT allow a `categoriaId` and a `bucketId` from
different buckets to coexist on the same transaction.

#### Scenario: Setting a categoría always aligns the bucket

- GIVEN a transaction assigned categoría "Streaming" (bucket Deseos)
- WHEN the transaction is read
- THEN `bucketId` resolves to Deseos, matching the categoría's bucket

#### Scenario: Ingreso and SinCategoria transactions have no categoría but a real bucket

- GIVEN a transaction classified as Ingreso (abono>0, cargo=0) or unmatched
  (SinCategoria)
- WHEN the transaction is read
- THEN `categoriaId` is null AND `bucketId` resolves to Ingreso or
  SinCategoria respectively (never null)

### Requirement: CAT-03 — Automatic classification persists `categoriaId`

`CategorizarTransaccionUseCase` MUST return `{ categoriaId, bucket }` (was
`{ bucket }`). Rules, in order, unchanged from US-012 except for the added
categoría:

1. Ingreso rule (`abono>0 && cargo===0`) → `categoriaId=null`, bucket Ingreso.
2. First matching pattern (priority asc, id asc tiebreak, unchanged) → the
   matched pattern's `categoriaId`; bucket = that categoría's bucket.
3. No match → `categoriaId=null`, bucket SinCategoria.

The use case MUST still never throw and MUST always return `Result.ok`.

#### Scenario: A matched pattern persists its categoría

- GIVEN a transaction description containing "netflix" and the seed pattern
  mapping it to categoría "Streaming"
- WHEN classification runs
- THEN the result is `{ categoriaId: <streaming-id>, bucket: Deseos }`

#### Scenario: An unmatched transaction gets no categoría

- GIVEN a transaction description matching no pattern and not satisfying the
  Ingreso rule
- WHEN classification runs
- THEN the result is `{ categoriaId: null, bucket: SinCategoria }`

### Requirement: CAT-04 — Fixed taxonomy is the single source of categorías

The categoría catalog MUST be exactly: Necesidades → {Supermercado,
Combustible, Farmacia, Salud, Transporte}; Deseos → {Streaming, Delivery};
Ahorro → {Ahorro}; Ingreso and SinCategoria have no categoría. The seed MUST
be idempotent (fixed ids, upsert) and MUST rewire every existing pattern to
reference a `categoriaId` consistent with its current bucket.

#### Scenario: Re-running the seed does not duplicate categorías

- GIVEN the categoría catalog was already seeded
- WHEN the seed runs again
- THEN the categoría count is unchanged and no duplicate rows exist

### Requirement: CAT-05 — Backfill assigns `categoriaId` to existing rows without inventing data

A one-time backfill MUST re-run pattern classification (CAT-03) over every
existing `Transaccion` that has no `categoriaId` yet (scope = `categoriaId IS
NULL`, which also makes the backfill safe to re-run without clobbering any
row a user has since manually reclassified): matched rows get `categoriaId` +
reconciled `bucketId`; unmatched rows get `categoriaId=null` and keep/receive
SinCategoria — the backfill MUST NOT guess a categoría for a row that no
pattern matches. The backfill MUST run under the existing
`ALLOW_DESTRUCTIVE_DB` gate (reject production connection strings by default;
production runs MUST require an explicit second acknowledgment on top of the
gate — see the shipped `allowProductionAck` + Supabase-host-detection posture
in `db-safety.ts`) and MUST be idempotent (safely re-runnable, same result on
repeat). A `--dry-run` mode MUST preview the money-movement impact (which
rows would change `bucketId`) before any write.

As actually run against production, the backfill preserved every existing
`Transaccion.bucketId` — no row's 50/30/20 bucket assignment changed as a
side effect of assigning `categoriaId`; only the new, previously-null
`categoriaId` column was populated from the matching pattern (or left null
for SinCategoria). This is the intended, conservative behavior of the
`categoriaId IS NULL` scope: history is enriched with the finer categoría,
never silently re-bucketed.

#### Scenario: Re-running the backfill is a no-op the second time

- GIVEN the backfill already ran once
- WHEN it runs again
- THEN no transaction's `categoriaId`/`bucketId` changes

#### Scenario: Non-matching existing rows land on SinCategoria, not a guess

- GIVEN an existing transaction whose description matches no current pattern
- WHEN the backfill runs
- THEN `categoriaId` stays null and bucket resolves to SinCategoria

#### Scenario: Backfill refuses to run without the destructive gate

- GIVEN `ALLOW_DESTRUCTIVE_DB` is not set to `1`
- WHEN the backfill script is invoked
- THEN it MUST refuse to mutate the database

#### Scenario: Backfill refuses to run against production without explicit acknowledgment

- GIVEN the target connection string resolves to a Supabase-hosted database
  (production, the project's only environment) or otherwise matches the
  production pattern
- WHEN the backfill script is invoked with `ALLOW_DESTRUCTIVE_DB=1` but
  without the production acknowledgment flag
- THEN it MUST refuse to mutate the database, even though the destructive
  gate is set

## Non-Goals

- User-created/custom categorías (fixed seed catalog only).
- IA/ML-based classification (RES-ALC-003).
- Sub-categorías / hierarchy deeper than one level below bucket.
- Editing patterns from the UI (seed-only).
