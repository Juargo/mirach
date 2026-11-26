-- ADR-012 and ADR-015 (PLA-01 to PLA-11): additive, safe to apply before the
-- deploy. Prisma does not model the CHECKs; see the comments on `Suscripcion`
-- and `PermisoPlan` in schema.prisma.

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "tienda" TEXT NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "ultimoEventoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Suscripcion_estado_check" CHECK ("estado" IN ('activa', 'en_gracia', 'cancelada', 'vencida')),
    CONSTRAINT "Suscripcion_tienda_check" CHECK ("tienda" IN ('app_store', 'play_store'))
);

-- CreateTable
CREATE TABLE "PermisoPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "otorgadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3),
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "PermisoPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PermisoPlan_motivo_check" CHECK ("motivo" IN ('prueba', 'tester_vitalicio', 'fundador'))
);

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_userId_key" ON "Suscripcion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoPlan_userId_motivo_key" ON "PermisoPlan"("userId", "motivo");

-- CreateIndex
CREATE INDEX "PermisoPlan_motivo_idx" ON "PermisoPlan"("motivo");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoPlan" ADD CONSTRAINT "PermisoPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Issue #105: every new table enables RLS in its own migration.
ALTER TABLE "Suscripcion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PermisoPlan" ENABLE ROW LEVEL SECURITY;
