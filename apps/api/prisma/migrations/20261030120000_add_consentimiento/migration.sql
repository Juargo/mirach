-- Issue #112 (AUTH-03, PRI-02, PRI-06, ADR-004 §8): additive, safe to apply
-- before the deploy. Prisma does not model the CHECK or the partial unique
-- index; see the comment on `Consentimiento` in schema.prisma.

-- CreateTable
CREATE TABLE "Consentimiento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "Consentimiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Consentimiento_tipo_check" CHECK ("tipo" IN ('terminos', 'privacidad', 'cartolas'))
);

-- CreateIndex
CREATE INDEX "Consentimiento_userId_idx" ON "Consentimiento"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Consentimiento_vigente_key" ON "Consentimiento"("userId", "tipo") WHERE "revocadoEn" IS NULL;

-- AddForeignKey
ALTER TABLE "Consentimiento" ADD CONSTRAINT "Consentimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Issue #105: every new table enables RLS in its own migration.
ALTER TABLE "Consentimiento" ENABLE ROW LEVEL SECURITY;
