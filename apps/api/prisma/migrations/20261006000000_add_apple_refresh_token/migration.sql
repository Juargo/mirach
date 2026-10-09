-- Sign in with Apple (plan phase 5, T4): add User.appleRefreshToken, the Apple
-- refresh token obtained by exchanging the client's authorization code. It is
-- stored ENCRYPTED (ADR-013, AES-GCM at the application layer; the key lives
-- outside the DB) and is only read to revoke it when the account is deleted.
-- Nullable and additive-only: existing rows stay NULL. Apply to production
-- BEFORE deploying the code that writes it.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleRefreshToken" TEXT;
