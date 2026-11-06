-- CLA-16: a movement the person reclassified by hand is never moved by a
-- pattern. Additive, safe to apply before the deploy. Existing rows start as
-- false: past manual changes were not recorded, so they cannot be recovered.

-- AlterTable
ALTER TABLE "Transaccion" ADD COLUMN "clasificacionManual" BOOLEAN NOT NULL DEFAULT false;
