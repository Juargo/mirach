-- Budget profile (#110, ADR-004 §8): the user's profile type and three goals
-- in integer basis points that sum 10000. Additive expansion (ADR-004 §7):
-- existing rows take the 50/30/20 defaults, so the old code keeps working.
-- Apply to production BEFORE deploying the code that reads it (Render does
-- not run migrations).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "perfilPresupuesto" TEXT NOT NULL DEFAULT '50_30_20',
ADD COLUMN     "metaNecesidadesBp" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "metaDeseosBp" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "metaAhorroBp" INTEGER NOT NULL DEFAULT 2000;

-- Prisma does not model CHECK constraints; they live here (see
-- add_cargo_abono_check). The domain enforces the same rules first.
ALTER TABLE "User" ADD CONSTRAINT "User_perfilPresupuesto_check"
  CHECK ("perfilPresupuesto" IN ('50_30_20', '60_20_20', '70_15_15', '80_10_10', 'personalizado'));
ALTER TABLE "User" ADD CONSTRAINT "User_metas_no_negativas_check"
  CHECK ("metaNecesidadesBp" >= 0 AND "metaDeseosBp" >= 0 AND "metaAhorroBp" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_metas_suman_10000_check"
  CHECK ("metaNecesidadesBp" + "metaDeseosBp" + "metaAhorroBp" = 10000);
-- A predefined profile carries exactly its own goals; only 'personalizado'
-- has free goals. Mirrors PerfilPresupuesto.desdePersistencia.
ALTER TABLE "User" ADD CONSTRAINT "User_perfil_predefinido_metas_check"
  CHECK (
    "perfilPresupuesto" = 'personalizado'
    OR ("perfilPresupuesto" = '50_30_20' AND "metaNecesidadesBp" = 5000 AND "metaDeseosBp" = 3000 AND "metaAhorroBp" = 2000)
    OR ("perfilPresupuesto" = '60_20_20' AND "metaNecesidadesBp" = 6000 AND "metaDeseosBp" = 2000 AND "metaAhorroBp" = 2000)
    OR ("perfilPresupuesto" = '70_15_15' AND "metaNecesidadesBp" = 7000 AND "metaDeseosBp" = 1500 AND "metaAhorroBp" = 1500)
    OR ("perfilPresupuesto" = '80_10_10' AND "metaNecesidadesBp" = 8000 AND "metaDeseosBp" = 1000 AND "metaAhorroBp" = 1000)
  );
