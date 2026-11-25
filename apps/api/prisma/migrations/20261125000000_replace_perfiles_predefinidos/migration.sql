-- Predefined budget profiles (PER-03): 60_20_20 and 70_15_15 are retired and
-- 65_20_15 and 90_5_5 take their place. 50_30_20 and 80_10_10 do not change.
--
-- NOT additive: after this runs, the previous code can no longer save
-- 60_20_20 or 70_15_15 (the CHECK rejects them), and before it runs the new
-- code cannot save 65_20_15 or 90_5_5. Apply to production right before
-- merging the code that reads it (Render deploys main and does not run
-- migrations), so the gap lasts only as long as the deploy.

ALTER TABLE "User" DROP CONSTRAINT "User_perfil_predefinido_metas_check";
ALTER TABLE "User" DROP CONSTRAINT "User_perfilPresupuesto_check";

-- A user on a retired profile keeps the same goals as a custom profile, so
-- none of their months change.
UPDATE "User" SET "perfilPresupuesto" = 'personalizado'
  WHERE "perfilPresupuesto" IN ('60_20_20', '70_15_15');

ALTER TABLE "User" ADD CONSTRAINT "User_perfilPresupuesto_check"
  CHECK ("perfilPresupuesto" IN ('50_30_20', '65_20_15', '80_10_10', '90_5_5', 'personalizado'));
-- A predefined profile carries exactly its own goals; only 'personalizado'
-- has free goals. Mirrors PerfilPresupuesto.desdePersistencia.
ALTER TABLE "User" ADD CONSTRAINT "User_perfil_predefinido_metas_check"
  CHECK (
    "perfilPresupuesto" = 'personalizado'
    OR ("perfilPresupuesto" = '50_30_20' AND "metaNecesidadesBp" = 5000 AND "metaDeseosBp" = 3000 AND "metaAhorroBp" = 2000)
    OR ("perfilPresupuesto" = '65_20_15' AND "metaNecesidadesBp" = 6500 AND "metaDeseosBp" = 2000 AND "metaAhorroBp" = 1500)
    OR ("perfilPresupuesto" = '80_10_10' AND "metaNecesidadesBp" = 8000 AND "metaDeseosBp" = 1000 AND "metaAhorroBp" = 1000)
    OR ("perfilPresupuesto" = '90_5_5' AND "metaNecesidadesBp" = 9000 AND "metaDeseosBp" = 500 AND "metaAhorroBp" = 500)
  );
