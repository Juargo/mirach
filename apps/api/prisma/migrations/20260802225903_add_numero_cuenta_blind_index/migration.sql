-- US-035 Slice 2: encrypt Account.numeroCuenta at rest + blind index for the
-- natural-key upsert (ingesta). The composite unique moves from the plaintext
-- numeroCuenta to the deterministic HMAC blind index (AES-GCM random IV is not
-- matchable). numeroCuentaBlindIndex is nullable only during the backfill
-- window; ensure()/demo/seed always populate it going forward.

-- DropIndex
DROP INDEX "Account_userId_banco_tipoCuenta_numeroCuenta_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "numeroCuentaBlindIndex" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_banco_tipoCuenta_numeroCuentaBlindIndex_key" ON "Account"("userId", "banco", "tipoCuenta", "numeroCuentaBlindIndex");
