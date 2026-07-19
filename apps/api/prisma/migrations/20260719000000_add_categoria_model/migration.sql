-- US-013 Slice S1: additive/nullable schema only, no data mutation, no
-- behavior change. Hand-authored (not generated via `prisma migrate dev`)
-- because the reachable Postgres instance is a SHARED dev database (Supabase
-- pooler), not a disposable local instance safe to auto-apply against — see
-- sdd-apply report. Mirrors the shape Prisma would generate for this schema
-- diff (verified via `prisma validate` + `prisma generate`).

-- AlterTable
ALTER TABLE "PatronClasificacion" ADD COLUMN     "categoriaId" TEXT;

-- AlterTable
ALTER TABLE "Transaccion" ADD COLUMN     "categoriaId" TEXT;

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nombre_key" ON "Categoria"("nombre");

-- CreateIndex
CREATE INDEX "Categoria_bucketId_idx" ON "Categoria"("bucketId");

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "BucketPresupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatronClasificacion" ADD CONSTRAINT "PatronClasificacion_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
