/*
  Warnings:

  - This is a BREAKING migration. The `Transaccion` money model changes from a
    single Decimal `monto` + `tipo` to two BigInt columns `cargo`/`abono`, and
    gains required FKs `ingestaId`/`accountId`. Existing `Transaccion` rows are
    dropped implicitly (dev-only data loss accepted, no production data — US-011).
  - The columns `banco`, `cuentaTipo`, `monto` and `tipo` on `Transaccion` are removed.
*/
-- CreateEnum
CREATE TYPE "EstadoIngesta" AS ENUM ('PENDIENTE', 'PROCESADA', 'FALLIDA');

-- AlterTable
ALTER TABLE "Transaccion" DROP COLUMN "banco",
DROP COLUMN "cuentaTipo",
DROP COLUMN "monto",
DROP COLUMN "tipo",
ADD COLUMN     "abono" BIGINT NOT NULL,
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "bucketId" TEXT,
ADD COLUMN     "cargo" BIGINT NOT NULL,
ADD COLUMN     "ingestaId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipoCuenta" TEXT NOT NULL,
    "numeroCuenta" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingesta" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "estado" "EstadoIngesta" NOT NULL DEFAULT 'PENDIENTE',
    "totalTransacciones" INTEGER,
    "motivoFallo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),

    CONSTRAINT "Ingesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_banco_tipoCuenta_numeroCuenta_key" ON "Account"("userId", "banco", "tipoCuenta", "numeroCuenta");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingesta" ADD CONSTRAINT "Ingesta_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_ingestaId_fkey" FOREIGN KEY ("ingestaId") REFERENCES "Ingesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
