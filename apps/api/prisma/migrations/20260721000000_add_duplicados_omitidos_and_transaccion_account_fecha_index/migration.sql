-- US-005 (Slice 2, PR2) — additive, no backfill of data.
--
-- Hand-authored (not generated via `prisma migrate dev`) because this
-- environment has no `DATABASE_URL` configured (no `.env` in this worktree)
-- and — mirroring the precedent set by
-- 20260719010000_drop_patron_bucketid — the reachable Postgres instance in
-- other environments is a SHARED dev database (Supabase pooler), not a
-- disposable local instance safe to auto-apply against. Verified via
-- `prisma validate` + `prisma generate` (both succeed against this schema
-- diff without needing a live DB connection); this SQL mirrors exactly what
-- Prisma would generate for the schema.prisma diff in this change.
--
-- Ingesta.duplicadosOmitidos Int @default(0): historical Ingesta rows
-- backfill to 0, which is semantically correct (they recorded no omissions
-- before this detection existed). No data migration needed.
--
-- Transaccion @@index([accountId, fecha]): non-unique, additive, backs the
-- bounded lookup in PrismaTransaccionExistenteReader. Deliberately NOT
-- unique (a unique index would abort the atomic createMany on the first
-- collision — the OPPOSITE of CA-03's auto-skip) and NOT on `descripcion`
-- (would break under real encryption + leak plaintext-adjacent data into an
-- index, ADR-013).

-- AlterTable
ALTER TABLE "Ingesta" ADD COLUMN "duplicadosOmitidos" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Transaccion_accountId_fecha_idx" ON "Transaccion"("accountId", "fecha");
