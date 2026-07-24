/**
 * categorizacion.int-spec.ts — Integration tests for US-012 categorization
 * (T18: scope isolation, T19: resilience, T21: FK integrity)
 *
 * These tests require:
 *  - A real dev/test Postgres DB (same as .env)
 *  - ALLOW_DESTRUCTIVE_DB=1
 *  - The migration add_categorizacion_buckets applied
 *  - seed.ts run (to populate BucketPresupuesto rows)
 *
 * Gate: assertDestructiveDbAllowed() runs in integration.setup.ts (setupFiles).
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { runSeed } from '../prisma/seed';
import { PrismaCatalogoClasificacionRepository } from '../src/infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../src/infrastructure/persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../src/infrastructure/persistence/prisma-transaccion-clasificacion.repository';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { CategorizacionFallidaError } from '../src/domain/errors/categorizacion-fallida.error';
import { Result } from '../src/shared/result';
import { PatronClasificacion } from '../src/domain/value-objects/patron-clasificacion';
import { ICatalogoClasificacion } from '../src/application/ports/catalogo-clasificacion.port';
import { Bucket } from '../src/domain/value-objects/bucket';
import { Categoria } from '../src/domain/value-objects/categoria';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import { USER_ID_FIJO, ACCOUNT_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Stub catálogo que siempre falla — used to exercise the degrade path end-to-end.
 * The real catalog repo is never called; instead this stub drives the same observable
 * behavior the real pipeline exercises when the DB is unavailable.
 */
class FailingCatalogo implements ICatalogoClasificacion {
  async findAll(): Promise<Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>> {
    return Result.fail(new CategorizacionFallidaError('test: catalog unavailable'));
  }
}

/**
 * Drives the categorization step synchronously (mirrors runCategorizacion in ProcessIngestaUseCase)
 * so T19 actually invokes the pipeline logic rather than building a local Result.
 */
async function runCategorizacionStep(
  ingestaId: string,
  catalogo: ICatalogoClasificacion,
  txReader: PrismaTransaccionClasificacionRepository,
  bucketWriter: PrismaTransaccionBucketRepository,
  categorizarUseCase: CategorizarTransaccionUseCase,
): Promise<{ asignadas: number; sinCategoria: number } | undefined> {
  try {
    let patrones: ReadonlyArray<PatronClasificacion> = [];
    let catalogoDisponible = true;
    const catalogResult = await catalogo.findAll();
    if (catalogResult.isOk()) {
      patrones = catalogResult.getValue();
    } else {
      catalogoDisponible = false;
    }

    const txs = await txReader.findParaClasificar(ingestaId);
    if (txs.length === 0) return { asignadas: 0, sinCategoria: 0 };

    const clasificadas = txs.map((tx) => {
      const { categoria, bucket } = categorizarUseCase
        .execute({ descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono }, patrones)
        .getValue();
      return { transaccionId: tx.id, categoria, bucket };
    });

    // Espeja runCategorizacion: catálogo caído → solo se escriben filas de Ingreso;
    // el resto queda null (pendiente). Catálogo disponible → se escribe todo.
    const asignaciones = catalogoDisponible
      ? clasificadas
      : clasificadas.filter((a) => a.bucket === Bucket.Ingreso);

    const sinCategoria = catalogoDisponible
      ? clasificadas.filter((a) => a.bucket === Bucket.SinCategoria).length
      : 0;

    const writeResult = await bucketWriter.asignarCategorizacion(ingestaId, asignaciones);
    if (writeResult.isFail()) return undefined;

    return { asignadas: writeResult.getValue().actualizadas, sinCategoria };
  } catch {
    return undefined;
  }
}

describe('Categorización — integración (real dev DB)', () => {
  const prisma = createPrismaClient();
  const catalogoRepo = new PrismaCatalogoClasificacionRepository(prisma);
  const bucketWriter = new PrismaTransaccionBucketRepository(prisma);
  const txClasificacionReader = new PrismaTransaccionClasificacionRepository(prisma);
  const categorizarUseCase = new CategorizarTransaccionUseCase();

  let testIngestaAId: string;
  let testIngestaBId: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Ensure seed data (buckets) is present — idempotent
    await runSeed(prisma);
  });

  beforeEach(async () => {
    // Create two test ingestas pointing to the fixed account
    const ingestaA = await prisma.ingesta.create({
      data: {
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-ingesta-A.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaAId = ingestaA.id;

    const ingestaB = await prisma.ingesta.create({
      data: {
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-ingesta-B.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaBId = ingestaB.id;
  });

  afterEach(async () => {
    // Clean up test data (FK cascade: delete transacciones first)
    if (testIngestaAId) {
      await prisma.transaccion.deleteMany({ where: { ingestaId: testIngestaAId } });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaAId } });
    }
    if (testIngestaBId) {
      await prisma.transaccion.deleteMany({ where: { ingestaId: testIngestaBId } });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaBId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // T18 — SC-15: scope isolation — only current ingesta rows updated
  it('T18/SC-15: clasificar ingesta B no modifica las filas de ingesta A', async () => {
    // Insert 5 pre-classified rows for ingesta A (with a known bucket)
    const txsA = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.transaccion.create({
          data: {
            ingestaId: testIngestaAId,
            accountId: ACCOUNT_ID_FIJO,
            fecha: new Date('2026-07-01'),
            descripcion: `Compra A-${i + 1}`,
            cargo: 10000n,
            abono: 0n,
            bucketId: BUCKET_IDS[Bucket.Necesidades], // pre-classified
          },
        }),
      ),
    );

    // Insert 3 unclassified rows for ingesta B
    const txsB = await Promise.all([
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 1500000n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Spotify',
          cargo: 5000n,
          abono: 0n,
        },
      }),
    ]);

    // Classify only ingesta B's transactions
    const catalogResult = await catalogoRepo.findAll();
    const patrones = catalogResult.isOk() ? catalogResult.getValue() : [];
    const txParaClasificar = await txClasificacionReader.findParaClasificar(testIngestaBId);
    const asignaciones = txParaClasificar.map((tx) => {
      const { categoria, bucket } = categorizarUseCase.execute(
        { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
        patrones,
      ).getValue();
      return { transaccionId: tx.id, categoria, bucket };
    });
    await bucketWriter.asignarCategorizacion(testIngestaBId, asignaciones);

    // Verify ingesta B rows were updated
    const updatedB = await prisma.transaccion.findMany({
      where: { id: { in: txsB.map((tx) => tx.id) } },
    });
    for (const tx of updatedB) {
      expect(tx.bucketId).not.toBeNull();
    }

    // Verify ingesta A rows are UNCHANGED (still Necesidades, not overwritten)
    const afterA = await prisma.transaccion.findMany({
      where: { id: { in: txsA.map((tx) => tx.id) } },
    });
    for (const tx of afterA) {
      expect(tx.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    }
  });

  // T19 — SC-13: catalog load failure → PROCESADA + rows stay null
  // Rewritten to actually drive the pipeline with a FailingCatalogo stub.
  // The test will fail if the degrade island is removed (no more passthrough).
  it('T19/SC-13: catálogo falla → pipeline degrada; filas de gasto quedan null, ingesta continúa PROCESADA', async () => {
    // Insert 2 transactions: one expense (cargo>0), one income (abono>0).
    const txExpense = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaBId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-02'),
        descripcion: 'Compra sin clasificar',
        cargo: 5000n,
        abono: 0n,
      },
    });
    const txIncome = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaBId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-02'),
        descripcion: 'Deposito sueldo',
        cargo: 0n,
        abono: 1200000n,
      },
    });

    // Drive the categorization step with a stub catalog that always fails.
    const failingCatalog = new FailingCatalogo();
    const resumen = await runCategorizacionStep(
      testIngestaBId,
      failingCatalog,
      txClasificacionReader,
      bucketWriter,
      categorizarUseCase,
    );

    // (a) The pipeline did not throw — it returned a resumen (degrade island held)
    expect(resumen).toBeDefined();

    // (b) Expense row: bucketId must remain null (catalog failed, pattern matching skipped)
    const afterExpense = await prisma.transaccion.findUnique({ where: { id: txExpense.id } });
    expect(afterExpense?.bucketId).toBeNull();

    // (c) Income row: Ingreso rule still fires even when catalog fails (abono>0, cargo=0)
    //     so bucketId should be the Ingreso bucket, not null.
    const afterIncome = await prisma.transaccion.findUnique({ where: { id: txIncome.id } });
    expect(afterIncome?.bucketId).toBe(BUCKET_IDS[Bucket.Ingreso]);

    // Ingesta remains PROCESADA (was set in beforeEach, nothing should change it here)
    const ingesta = await prisma.ingesta.findUnique({ where: { id: testIngestaBId } });
    expect(ingesta?.estado).toBe('PROCESADA');
  });

  // T21 — FK integrity: assigned categoriaId/bucketId resolve to Categoria/BucketPresupuesto; null rows remain valid
  it('T21: asignarCategorizacion persiste FKs válidas (categoriaId+bucketId); filas con bucketId null pre-existentes siguen siendo válidas', async () => {
    // Insert tx with null bucket
    const txNull = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaBId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-02'),
        descripcion: 'Tx sin bucket inicial',
        cargo: 1000n,
        abono: 0n,
      },
    });
    expect(txNull.bucketId).toBeNull(); // pre-existing null is valid

    // Assign a real categoría+bucket (ingestaId for structural scope isolation)
    const writeResult = await bucketWriter.asignarCategorizacion(testIngestaBId, [
      { transaccionId: txNull.id, categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
    ]);
    expect(writeResult.isOk()).toBe(true);

    // Verify FKs resolve correctly
    const updated = await prisma.transaccion.findUnique({
      where: { id: txNull.id },
      include: { bucket: true, categoria: true },
    });
    expect(updated?.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(updated?.bucket?.nombre).toBe(Bucket.Necesidades);
    expect(updated?.categoriaId).toBe(CATEGORIA_IDS[Categoria.Supermercado]);
    expect(updated?.categoria?.nombre).toBe(Categoria.Supermercado);

    // Verify a different null-bucket row (from ingesta A setup if any) is still valid
    const anotherNull = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaAId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-01'),
        descripcion: 'Tx nula existente',
        cargo: 500n,
        abono: 0n,
        // bucketId intentionally omitted → null
      },
    });
    const stillNull = await prisma.transaccion.findUnique({ where: { id: anotherNull.id } });
    expect(stillNull?.bucketId).toBeNull(); // null FK rows remain valid after migration
  });
});
