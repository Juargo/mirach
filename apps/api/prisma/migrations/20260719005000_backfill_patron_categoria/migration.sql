-- US-013 data migration: bridges S1 → S2.
--
-- S1 (20260719000000_add_categoria_model) creates the Categoria table
-- (empty) and adds PatronClasificacion.categoriaId as NULLABLE. S2
-- (20260719010000_drop_patron_bucketid) tightens categoriaId to NOT NULL and
-- drops the now-redundant bucketId column. Both the Categoria catalog and
-- the PatronClasificacion.categoriaId backfill are otherwise only populated
-- by prisma/seed.ts — but `prisma migrate deploy` cannot run `prisma db
-- seed` in between S1 and S2, so on a database that already has
-- PatronClasificacion rows (e.g. prod, with the fixed 20-row catalog seeded
-- before US-013) a plain back-to-back S1→S2 deploy fails: the FK to
-- Categoria (still empty) rejects the backfill, or S2's NOT NULL constraint
-- rejects rows that never got a categoriaId.
--
-- This migration seeds the fixed Categoria catalog (8 rows) and then
-- backfills categoriaId on the fixed, seed-owned pattern catalog (ids and
-- values mirror prisma/seed.ts CATEGORIA_CATALOG / PATRON_CATALOG via
-- CATEGORIA_IDS / BUCKET_IDS / CATEGORIA_BUCKET — both catalogs are
-- seed-owned, never user-created, see categorias-model spec Non-Goals) so
-- S2's NOT NULL succeeds unconditionally.
--
-- Safe on a fresh/empty database too: the Categoria insert is
-- ON CONFLICT DO NOTHING (seed.ts upserts the same rows afterward with
-- identical values), and the PatronClasificacion UPDATE's WHERE clause only
-- touches existing rows with a matching id, so it is a 0-row no-op there.
-- Idempotent: re-running (or running after seed already populated newer
-- rows) never overwrites an already-set value.

-- Seed the fixed Categoria catalog (mirrors seed.ts CATEGORIA_CATALOG).
INSERT INTO "Categoria" ("id", "nombre", "bucketId") VALUES
  ('categoria-supermercado', 'Supermercado', 'bucket-necesidades'),
  ('categoria-combustible',  'Combustible',  'bucket-necesidades'),
  ('categoria-farmacia',     'Farmacia',     'bucket-necesidades'),
  ('categoria-salud',        'Salud',        'bucket-necesidades'),
  ('categoria-transporte',   'Transporte',   'bucket-necesidades'),
  ('categoria-streaming',    'Streaming',    'bucket-deseos'),
  ('categoria-delivery',     'Delivery',     'bucket-deseos'),
  ('categoria-ahorro',       'Ahorro',       'bucket-ahorro')
ON CONFLICT ("id") DO NOTHING;

-- Backfill categoriaId on the fixed pattern catalog (mirrors seed.ts
-- PATRON_CATALOG).
UPDATE "PatronClasificacion"
SET "categoriaId" = CASE "id"
  -- Necesidades
  WHEN 'pat-lider'                 THEN 'categoria-supermercado'
  WHEN 'pat-jumbo'                 THEN 'categoria-supermercado'
  WHEN 'pat-unimarc'               THEN 'categoria-supermercado'
  WHEN 'pat-santa-isabel'          THEN 'categoria-supermercado'
  WHEN 'pat-tottus'                THEN 'categoria-supermercado'
  WHEN 'pat-copec'                 THEN 'categoria-combustible'
  WHEN 'pat-shell'                 THEN 'categoria-combustible'
  WHEN 'pat-farmacia'              THEN 'categoria-farmacia'
  WHEN 'pat-isapre'                THEN 'categoria-salud'
  WHEN 'pat-transantiago'          THEN 'categoria-transporte'
  WHEN 'pat-bip'                   THEN 'categoria-transporte'
  -- Deseos
  WHEN 'pat-netflix'               THEN 'categoria-streaming'
  WHEN 'pat-spotify'               THEN 'categoria-streaming'
  WHEN 'pat-amazon-prime'          THEN 'categoria-streaming'
  WHEN 'pat-uber-eats'             THEN 'categoria-delivery'
  WHEN 'pat-rappi'                 THEN 'categoria-delivery'
  -- Ahorro
  WHEN 'pat-fintual'               THEN 'categoria-ahorro'
  WHEN 'pat-bci-ahorro'            THEN 'categoria-ahorro'
  WHEN 'pat-afp'                   THEN 'categoria-ahorro'
  WHEN 'pat-transferencia-ahorro'  THEN 'categoria-ahorro'
  ELSE "categoriaId"
END
WHERE "categoriaId" IS NULL
  AND "id" IN (
    'pat-lider', 'pat-jumbo', 'pat-unimarc', 'pat-santa-isabel', 'pat-tottus',
    'pat-copec', 'pat-shell', 'pat-farmacia', 'pat-isapre', 'pat-transantiago',
    'pat-bip', 'pat-netflix', 'pat-spotify', 'pat-amazon-prime', 'pat-uber-eats',
    'pat-rappi', 'pat-fintual', 'pat-bci-ahorro', 'pat-afp', 'pat-transferencia-ahorro'
  );
