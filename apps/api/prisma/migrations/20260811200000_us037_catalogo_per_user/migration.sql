-- US-037: per-user classification catalog (copy-on-signup).
--
-- Moves Categoria + PatronClasificacion from a single global row set shared
-- by every user to a per-user owned row set. This migration and the code
-- change that lands with it (catalogo-template.ts, repository rewiring) are
-- ONE atomic deployable unit — see design.md §12 "Atomic deployable unit".
--
-- Ordering (design.md §2.3), each step load-bearing:
--   0. Guard: abort if more than one non-demo user exists (the global
--      catalog cannot be assigned unambiguously); on a genuinely fresh
--      database (zero non-demo users) clear the owner-less Categoria /
--      PatronClasificacion rows self-provisioned by migration
--      20260719005000_backfill_patron_categoria, so a fresh/CI database
--      never has orphan rows blocking the NOT NULL tightening below.
--   1. Purge pre-existing demo users (Open question 1, design.md §10.1) —
--      demo users are ephemeral by contract (7-day TTL), so deleting them
--      here is the system's own normal cleanup, executed once at a chosen
--      moment. Mirrors DemoCleanupService.borrarExpirados()'s exact delete
--      order and join shape (Session -> Transaccion (via Account.userId,
--      NOT a direct FK) -> Ingesta (direct userId, US-004) -> Account ->
--      User). No Categoria/PatronClasificacion delete needed here: demo
--      users own no catalog rows yet (userId does not exist on those
--      tables before step 2).
--   2. Add both userId columns NULLABLE first (a table with existing rows
--      cannot gain a NOT NULL column without a default).
--   3. Backfill: every existing Categoria row is owned by the single
--      remaining non-demo user (post-purge, guaranteed unique by step 0);
--      every PatronClasificacion row inherits its owner from its own
--      Categoria row. No Transaccion.categoriaId or
--      PatronClasificacion.categoriaId FK is repointed (design.md D-05) —
--      existing ids are kept as-is, only ownership is stamped.
--   4. Tighten: SET NOT NULL on both userId columns; drop the old global
--      Categoria.nombre unique index and the old single-column
--      PatronClasificacion -> Categoria FK; add the new per-user unique
--      constraints/index and the composite FK
--      (categoriaId, userId) -> Categoria(id, userId) that makes
--      "PatronClasificacion.userId = its Categoria.userId" a database
--      invariant instead of an assumption (design.md D-04/D-06). The
--      composite FK shape was confirmed available in this Prisma/Postgres
--      version via a pure schema diff (task 1.2 gate) before this file was
--      written — no fallback needed.
--
-- Reversibility: NOT reversible by data (constraint tightening + demo
-- purge are destructive). Prod runbook: take a Supabase snapshot
-- immediately before applying; rollback = restore from snapshot. A
-- code-only rollback with this schema applied is unsafe (treat migration +
-- code as one deployable unit, design.md §12).

-- ── Step 0: guard + fresh-database branch ──────────────────────────────
DO $$
DECLARE n_reales integer;
BEGIN
  SELECT count(*) INTO n_reales FROM "User" WHERE "esDemo" = false;

  IF n_reales > 1 THEN
    RAISE EXCEPTION 'us-037: % non-demo users found — the global catalog cannot be assigned unambiguously. Aborting.', n_reales;
  END IF;

  IF n_reales = 0 THEN
    -- n_reales = 0 means zero NON-DEMO users — NOT zero users. A fresh/CI
    -- database can still have demo users (and their accounts/transactions)
    -- at this point; they are purged in step 1, right after this block.
    -- The self-provisioned Categoria/PatronClasificacion rows from
    -- migration 20260719005000 are owner-less either way, so clearing them
    -- here (ahead of the purge) is safe: Transaccion.categoriaId is
    -- `onDelete: SetNull` (schema.prisma), so any demo Transaccion still
    -- pointing at these rows just gets categoriaId cleared, not deleted.
    -- prisma/seed.ts recreates the catalog owned by USER_ID_FIJO with the
    -- same fixed ids immediately afterwards (test:db:setup / CI bootstrap).
    DELETE FROM "PatronClasificacion";
    DELETE FROM "Categoria";
  END IF;
END $$;

-- ── Step 1: purge pre-existing demo users ──────────────────────────────
-- Mirrors DemoCleanupService.borrarExpirados(): Session -> Transaccion (via
-- Account.userId, NOT Ingesta.userId — a demo user's Transaccion rows hang
-- off their Account) -> Ingesta (direct userId) -> Account -> User.
DELETE FROM "Session"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "Transaccion"
  WHERE "accountId" IN (
    SELECT "id" FROM "Account"
    WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true)
  );

DELETE FROM "Ingesta"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "Account"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "User" WHERE "esDemo" = true;

-- ── Step 2: add nullable columns ────────────────────────────────────────
ALTER TABLE "Categoria" ADD COLUMN "userId" TEXT;
ALTER TABLE "PatronClasificacion" ADD COLUMN "userId" TEXT;

-- ── Step 3: backfill ─────────────────────────────────────────────────────
-- Post-purge (step 1) and post-guard (step 0), at most one non-demo user
-- remains — that user becomes the owner of every existing catalog row.
-- Patterns inherit from their own category, which is what makes the
-- "Patron.userId = Patron.categoria.userId" invariant true by construction
-- at migration time, ahead of step 4's composite FK enforcing it forever.
UPDATE "Categoria" SET "userId" = (SELECT "id" FROM "User" WHERE "esDemo" = false LIMIT 1)
  WHERE "userId" IS NULL;

UPDATE "PatronClasificacion" p SET "userId" = c."userId"
  FROM "Categoria" c
  WHERE c."id" = p."categoriaId" AND p."userId" IS NULL;

-- ── Step 4: tighten ──────────────────────────────────────────────────────
ALTER TABLE "Categoria" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PatronClasificacion" ALTER COLUMN "userId" SET NOT NULL;

-- Drop the old global-uniqueness constraint on Categoria.nombre — per-user
-- uniqueness replaces it below.
DROP INDEX "Categoria_nombre_key";

-- Drop the old single-column FK before adding the composite one that
-- supersedes it.
ALTER TABLE "PatronClasificacion" DROP CONSTRAINT "PatronClasificacion_categoriaId_fkey";

CREATE UNIQUE INDEX "Categoria_userId_nombre_key" ON "Categoria"("userId", "nombre");
CREATE UNIQUE INDEX "Categoria_id_userId_key" ON "Categoria"("id", "userId");
CREATE INDEX "PatronClasificacion_userId_idx" ON "PatronClasificacion"("userId");

ALTER TABLE "Categoria"
  ADD CONSTRAINT "Categoria_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatronClasificacion"
  ADD CONSTRAINT "PatronClasificacion_categoriaId_userId_fkey"
  FOREIGN KEY ("categoriaId", "userId") REFERENCES "Categoria"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
