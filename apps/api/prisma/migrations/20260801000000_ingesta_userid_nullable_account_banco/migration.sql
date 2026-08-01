-- US-004 (Historial de archivos cargados): widen Ingesta to be the historial's
-- source of truth for BOTH successful (PROCESADA) and failed (FALLIDA)
-- upload attempts, including failures that occur before an Account is
-- resolved (invalid extension, unrecognized bank).
--
-- Two-phase NOT NULL backfill (standard safe pattern, precedent
-- add_cargo_abono_check / 20260710185710): add nullable -> backfill from the
-- owning Account -> enforce NOT NULL -> FK + index. Every pre-migration
-- Ingesta row has a non-null accountId (the pre-migration schema forbids
-- null), so this backfill is TOTAL — no orphan rows expected.
--
-- PROD SUPERVISION (design.md §5.2/§10.3, D9): before/after this migration
-- runs on Supabase, run:
--   SELECT count(*) FROM "Ingesta" WHERE "userId" IS NULL;
-- Expect a positive count (or table absent of the column) BEFORE step 2, and
-- exactly 0 AFTER step 2 (step 3 below would otherwise fail loudly, which is
-- the fail-closed guard). Additionally, per the ADR-013 supervised-backfill
-- precedent, REHEARSE this exact join-based UPDATE against a prod
-- snapshot/dump before applying to the real prod database — the local
-- integration suite proves the SQL is correct in shape, not that it behaves
-- identically against prod's actual row population.

-- 1. Add userId NULLABLE first (so existing rows don't reject on a non-null add).
ALTER TABLE "Ingesta" ADD COLUMN "userId" TEXT;

-- 2. Backfill from the owning account. Every existing row has a non-null
--    accountId (the pre-migration schema forbids null), so this backfill is
--    TOTAL — no orphans.
UPDATE "Ingesta" i
   SET "userId" = a."userId"
  FROM "Account" a
 WHERE i."accountId" = a."id" AND i."userId" IS NULL;

-- 3. Enforce non-null. Fails LOUDLY (fail-closed) if any row is unbackfilled
--    — which cannot happen given the invariant above, but the guard is free.
ALTER TABLE "Ingesta" ALTER COLUMN "userId" SET NOT NULL;

-- 4. FK + index (mirror the Session/Account userId FK).
ALTER TABLE "Ingesta"
  ADD CONSTRAINT "Ingesta_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Ingesta_userId_idx" ON "Ingesta"("userId");

-- 5. Relax accountId / banco to nullable (pure widening — no data change, safe).
ALTER TABLE "Ingesta" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "Ingesta" ALTER COLUMN "banco"     DROP NOT NULL;

-- 6. Money-integrity invariant (raw SQL — Prisma can't model CHECK; not in
--    schema.prisma, same posture as add_cargo_abono_check/20260710185710).
--    A PROCESADA row with accountId = null would escape the money-view
--    isolation reasoning (Transaccion.account: { userId }) — this CHECK
--    defends that invariant at the data layer (defense-in-depth on top of
--    the application-layer single-writer guarantee, design.md §3.4/D6).
ALTER TABLE "Ingesta" ADD CONSTRAINT "Ingesta_procesada_requires_account"
  CHECK ("estado" <> 'PROCESADA' OR "accountId" IS NOT NULL);
