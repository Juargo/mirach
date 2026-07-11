-- CreateTable
CREATE TABLE "BucketPresupuesto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "BucketPresupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatronClasificacion" (
    "id" TEXT NOT NULL,
    "patron" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "prioridad" INTEGER NOT NULL,

    CONSTRAINT "PatronClasificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BucketPresupuesto_nombre_key" ON "BucketPresupuesto"("nombre");

-- AddForeignKey
ALTER TABLE "PatronClasificacion" ADD CONSTRAINT "PatronClasificacion_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "BucketPresupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "BucketPresupuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
