-- categoria-iconografia (ADR-045): adds the nullable `icono` column to
-- `Categoria`. No DB CHECK (D-03) — the domain allowlist
-- (icono-categoria.ts) is the sole authority for validity, so an allowlist
-- edit never requires a schema migration. No backfill: pre-existing rows
-- stay NULL and render the client-side fallback (CATICO-04/06).
ALTER TABLE "Categoria" ADD COLUMN "icono" TEXT;
