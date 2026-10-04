-- Demo mode removal (plan phase 5, T1 / S3; amends ADR-046 D5).
-- Nothing reads "esDemo" or "demoCreatedAt" anymore, so any pre-existing
-- demo user is deleted together with everything it owns, then both columns go.

-- Step 1: purge demo users, same order the old DemoCleanupService used, plus
-- the per-user catalog (US-037). Transaccion hangs off Account, not Ingesta.
DELETE FROM "Session"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "Transaccion"
  WHERE "accountId" IN (
    SELECT "id" FROM "Account"
    WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true)
  );

DELETE FROM "Ingesta"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "PatronClasificacion"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "Categoria"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "Account"
  WHERE "userId" IN (SELECT "id" FROM "User" WHERE "esDemo" = true);

DELETE FROM "User" WHERE "esDemo" = true;

-- Step 2: drop the columns (no index existed on either).
ALTER TABLE "User" DROP COLUMN "esDemo",
DROP COLUMN "demoCreatedAt";
