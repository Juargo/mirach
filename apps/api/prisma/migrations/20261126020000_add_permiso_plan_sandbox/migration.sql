-- ADR-015 §5 (PLA-10): additive, safe to apply before the deploy. A Fundador
-- grant bought in a store sandbox does not use one of the seats.

-- AlterTable
ALTER TABLE "PermisoPlan" ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;
