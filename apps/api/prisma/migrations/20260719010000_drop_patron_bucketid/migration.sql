-- US-013 Slice S2: tighten PatronClasificacion.categoriaId to NOT NULL and
-- DROP the now-redundant PatronClasificacion.bucketId column (the bucket is
-- derived from categoria.bucket in the domain VO — see design.md §1.1/§1.3).
-- Safe because S1's seed (20260719000000_add_categoria_model + seed.ts)
-- already populated categoriaId on every PatronClasificacion row (the
-- catalog is fixed/seed-owned, never user-created — see categorias-model
-- spec Non-Goals).
--
-- Hand-authored (not generated via `prisma migrate dev`) for the same reason
-- as S1's migration: the reachable Postgres instance is a SHARED dev
-- database (Supabase pooler), not a disposable local instance safe to
-- auto-apply against — see sdd-apply S2 report. Mirrors the shape Prisma
-- would generate for this schema diff (verified via `prisma validate` +
-- `prisma generate`).

-- DropForeignKey (PatronClasificacion.bucketId → BucketPresupuesto, dropped column)
ALTER TABLE "PatronClasificacion" DROP CONSTRAINT "PatronClasificacion_bucketId_fkey";

-- DropForeignKey (PatronClasificacion.categoriaId, was nullable ON DELETE SET NULL;
-- re-added below as NOT NULL ON DELETE RESTRICT — Prisma's default for a required relation)
ALTER TABLE "PatronClasificacion" DROP CONSTRAINT "PatronClasificacion_categoriaId_fkey";

-- AlterTable
ALTER TABLE "PatronClasificacion" ALTER COLUMN "categoriaId" SET NOT NULL;
ALTER TABLE "PatronClasificacion" DROP COLUMN "bucketId";

-- AddForeignKey
ALTER TABLE "PatronClasificacion" ADD CONSTRAINT "PatronClasificacion_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
