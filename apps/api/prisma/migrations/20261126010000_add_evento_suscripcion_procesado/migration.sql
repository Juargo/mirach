-- ADR-012 §1: additive, safe to apply before the deploy. Idempotency ledger of
-- the RevenueCat webhook.

-- CreateTable
CREATE TABLE "EventoSuscripcionProcesado" (
    "id" TEXT NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSuscripcionProcesado_pkey" PRIMARY KEY ("id")
);

-- Issue #105: every new table enables RLS in its own migration.
ALTER TABLE "EventoSuscripcionProcesado" ENABLE ROW LEVEL SECURITY;
