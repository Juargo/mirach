-- US-058: manual movements. A Transaccion may now be manual (no ingesta).
-- Two schema moves + one data-integrity CHECK, one migration.

-- 1. Relax ingestaId to nullable (US-004 relax pattern, 20260801000000:44-46).
--    Pure widening — no data change. Existing rows keep a non-null ingestaId.
--    NOTE: keep the FK onDelete pinned to Restrict (schema.prisma:185 has no
--    explicit onDelete; Prisma default for a required relation is Restrict.
--    After relaxing to optional, Prisma's default for an OPTIONAL relation is
--    SetNull — so schema.prisma MUST pin `onDelete: Restrict` explicitly on the
--    ingesta relation to avoid a drift-regenerated migration, exactly as the
--    Ingesta.account relation does at schema.prisma:100).
ALTER TABLE "Transaccion" ALTER COLUMN "ingestaId" DROP NOT NULL;

-- 2. Add origen (C-a): null = ingesta-born, 'Manual' = manual. Additive, no backfill.
ALTER TABLE "Transaccion" ADD COLUMN "origen" TEXT;

-- 3. Pairing invariant (raw SQL — Prisma can't model CHECK; same posture as
--    Transaccion_cargo_abono_no_negativos / 20260710185710 and
--    Ingesta_procesada_requires_account / 20260801000000:54-55).
--    (ingestaId IS NULL)  ⇔  (origen IS NOT DISTINCT FROM 'Manual')
--    NULL-safe form chosen because Postgres three-valued logic makes the naive
--    (ingestaId IS NULL) = (origen = 'Manual') PASS on (ingestaId=NULL, origen=NULL):
--    NULL = 'Manual' evaluates to NULL, and TRUE = NULL evaluates to NULL,
--    and a NULL CHECK result is treated as passing by Postgres.
--    IS NOT DISTINCT FROM uses null-safe equality (SQL standard), the same
--    idiom already used in this repo's CHECK precedents.
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_origen_ingesta_consistency"
  CHECK (("ingestaId" IS NULL) = ("origen" IS NOT DISTINCT FROM 'Manual'));
