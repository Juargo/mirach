-- categoria-unica-por-bucket (ADR-042): Categoria uniqueness moves from
-- (userId, nombre) to (userId, bucketId, nombre). A user MAY hold the same
-- categoria name in two different buckets, and MUST NOT within one. Amends
-- ONLY the uniqueness clause of ADR-036/037; the composite-FK target
-- (id, userId) and the (prioridad, patron, id) tiebreak are untouched.
--
-- Pure relaxation, no backfill, no guard. (userId, nombre) is unique today
-- => no two existing rows share it => no two rows can violate the superset
-- key (userId, bucketId, nombre). Every row satisfying the old constraint
-- trivially satisfies the new one.
--
-- Column ORDER is load-bearing: it determines Prisma's generated compound
-- selector name (userId_bucketId_nombre). It must match schema.prisma:149.
DROP INDEX "Categoria_userId_nombre_key";
CREATE UNIQUE INDEX "Categoria_userId_bucketId_nombre_key"
  ON "Categoria" ("userId", "bucketId", "nombre");
