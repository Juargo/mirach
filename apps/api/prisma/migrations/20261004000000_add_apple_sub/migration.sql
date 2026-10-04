-- Sign in with Apple (plan phase 5, T3): add User.appleSub, the opaque `sub`
-- claim of Apple's identity token. Cleartext and unique for the same reason as
-- "googleSub": it is not readable PII and a deterministic lookup key, which
-- the non-deterministic encryption of ADR-013 would rule out. Nullable and
-- additive-only: existing rows stay NULL.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");
