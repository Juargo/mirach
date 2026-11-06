-- CLA-12: the pattern tie-break is "longest wins, then oldest". Additive, safe
-- to apply before the deploy. Existing rows all get the migration time, so
-- among them a tie falls back to the pattern text, as it does today.

-- AlterTable
ALTER TABLE "PatronClasificacion" ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
