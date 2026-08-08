-- auth-google-login (AUTH-14, slice A): add User.googleSub, the opaque OIDC
-- identifier used to find/link a MoneyDiary user by prior Google login.
-- Additive-only: existing rows get NULL, no backfill, no data rewrite.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
