-- Financial month and declared income (#111, ADR-004 §8, PER-02, PER-08):
-- the cut-off day (1 to 28, default 1 = calendar month) and the optional
-- declared monthly net income in pesos. Additive expansion (ADR-004 §7):
-- existing rows take day 1 and no declared income, so the old code keeps
-- working. Apply to production BEFORE deploying the code that reads it
-- (Render does not run migrations).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "diaCorte" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ingresoDeclarado" BIGINT;

-- Prisma does not model CHECK constraints; they live here (see
-- add_perfil_presupuesto). The domain enforces the same rules first.
ALTER TABLE "User" ADD CONSTRAINT "User_diaCorte_check"
  CHECK ("diaCorte" BETWEEN 1 AND 28);
ALTER TABLE "User" ADD CONSTRAINT "User_ingresoDeclarado_check"
  CHECK ("ingresoDeclarado" IS NULL OR "ingresoDeclarado" > 0);
