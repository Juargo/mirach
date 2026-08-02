-- US-035: encrypt User.email at rest + blind index for equality lookups.
-- email loses its unique constraint (AES-GCM random IV is not deterministic);
-- uniqueness and login lookups move to the deterministic HMAC blind index.

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailBlindIndex" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailBlindIndex_key" ON "User"("emailBlindIndex");
