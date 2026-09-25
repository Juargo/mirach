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
import { loadEnv } from '../src/config/env';
import { runSeed } from '../prisma/seed';
import { PrismaCatalogoClasificacionRepository } from '../src/infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../src/infrastructure/persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../src/infrastructure/persistence/prisma-transaccion-clasificacion.repository';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { PatronClasificacion } from '../src/domain/value-objects/patron-clasificacion';
import { ICatalogoClasificacion } from '../src/application/ports/catalogo-clasificacion.port';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import { categoriaIdDe } from './helpers/categoria-fixture';
import {
  ACCOUNT_ID_FIJO,
  USER_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { buildTestEnv } from './support/env.fixture';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { NoOpLogger } from './support/logger.double';

/**
 * Drives the categorization step synchronously (mirrors runCategorizacion in ProcessIngestaUseCase)
 * so T19 actually invokes the pipeline logic rather than building a local Result.
 */
async function runCategorizacionStep(
  ingestaId: string,
  userId: string,
  catalogo: ICatalogoClasificacion,
  txReader: PrismaTransaccionClasificacionRepository,
  bucketWriter: PrismaTransaccionBucketRepository,
  categorizarUseCase: CategorizarTransaccionUseCase,
): Promise<{ asignadas: number } | undefined> {
  try {
    let patrones: ReadonlyArray<PatronClasificacion> = [];
    let catalogoDisponible = true;
    const catalogResult = await catalogo.findAll(userId);
    if (catalogResult.isOk()) {
      patrones = catalogResult.getValue();
    } else {
      catalogoDisponible = false;
    }

    const txs = await txReader.findParaClasificar(ingestaId);
    if (txs.length === 0) return { asignadas: 0 };

    // #778 tramo 5b PR5: `Bucket.SinCategoria` no longer exists — a
    // `'sinCoincidencia'` result (no pattern matched AND no
    // `categoriaPorDefecto`, deliberately `null` below: este int-spec
    // ejercita la degradación de PATRONES, no la categoría por defecto) no
    // tiene NINGÚN destino de bucket que escribir, así que esas filas se
    // EXCLUYEN de `asignaciones` (quedan `bucketId` intacto/null), igual que
    // `ReevaluarCategoriasUseCase` las trata como "no tocar esta fila".
    const clasificadas = txs
      .map((tx) => {
        const resultado = categorizarUseCase
          .execute(
            { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
            patrones,
            null,
          )
          .getValue();
        return resultado.tipo === 'clasificada'
          ? {
              transaccionId: tx.id,
              categoriaId: resultado.categoria?.id ?? null,
              bucket: resultado.bucket,
            }
          : null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Espeja runCategorizacion: catálogo caído → solo se escriben filas de Ingreso;
    // el resto queda null (pendiente). Catálogo disponible → se escribe todo lo clasificado.
    const asignaciones = catalogoDisponible
      ? clasificadas
      : clasificadas.filter((a) => a.bucket === Bucket.Ingreso);

    const writeResult = await bucketWriter.asignarCategorizacion(
      userId,
      ingestaId,
      asignaciones,
    );
    if (writeResult.isFail()) return undefined;

    return { asignadas: writeResult.getValue().actualizadas };
  } catch {
    return undefined;
  }
}

describe('Categorización — integración (real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const catalogoRepo = new PrismaCatalogoClasificacionRepository(prisma);
  const bucketWriter = new PrismaTransaccionBucketRepository(prisma);
  // ADR-013: adapter REAL (no NoOp) para que este int-spec ejercite el
  // decrypt real — la clave de 32 bytes viene del fixture compartido
  // (test/support/env.fixture.ts), nunca hardcodeada acá. Reutilizado
  // también para cifrar los seeds de `descripcion` de este archivo (US-036:
  // decrypt() ya no hace passthrough de texto plano, así que cualquier seed
  // que se lea vía `txClasificacionReader.findParaClasificar` debe llegar
  // como ciphertext v1 cifrado con esta MISMA clave).
  const crypto = new AesGcmCryptoService(
    Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
  );
  const txClasificacionReader = new PrismaTransaccionClasificacionRepository(
    prisma,
    crypto,
  );
  const categorizarUseCase = new CategorizarTransaccionUseCase(
    new NoOpLogger(),
  );

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
        userId: USER_ID_FIJO,
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-ingesta-A.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaAId = ingestaA.id;

    const ingestaB = await prisma.ingesta.create({
      data: {
        userId: USER_ID_FIJO,
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
      await prisma.transaccion.deleteMany({
        where: { ingestaId: testIngestaAId },
      });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaAId } });
    }
    if (testIngestaBId) {
      await prisma.transaccion.deleteMany({
        where: { ingestaId: testIngestaBId },
      });
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

    // Insert 3 unclassified rows for ingesta B. `descripcion` cifrada
    // (US-036): estas filas se leen vía txClasificacionReader.findParaClasificar
    // más abajo, que llama decrypt() con la clave real — un seed en texto
    // plano ya no hace passthrough, lanza.
    const txsB = await Promise.all([
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: crypto.encrypt('Compra Lider'),
          cargo: 9500n,
          abono: 0n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: crypto.encrypt('Sueldo'),
          cargo: 0n,
          abono: 1500000n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: crypto.encrypt('Spotify'),
          cargo: 5000n,
          abono: 0n,
        },
      }),
    ]);

    // Classify only ingesta B's transactions
    const catalogResult = await catalogoRepo.findAll(USER_ID_FIJO);
    const patrones = catalogResult.isOk() ? catalogResult.getValue() : [];
    const txParaClasificar =
      await txClasificacionReader.findParaClasificar(testIngestaBId);
    // #778 tramo 5b PR5: `Bucket.SinCategoria` no longer exists — see the
    // equivalent comment in `runCategorizacionStep` above. Every row here
    // (Lider/Sueldo/Spotify) DOES match a pattern or the Ingreso rule, so
    // this filter is defensive, not exercised by this fixture.
    const asignaciones = txParaClasificar
      .map((tx) => {
        const resultado = categorizarUseCase
          .execute(
            { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
            patrones,
            // #778 es otro tramo: este int-spec ejercita la degradación de
            // PATRONES, no la categoría por defecto.
            null,
          )
          .getValue();
        return resultado.tipo === 'clasificada'
          ? {
              transaccionId: tx.id,
              categoriaId: resultado.categoria?.id ?? null,
              bucket: resultado.bucket,
            }
          : null;
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    await bucketWriter.asignarCategorizacion(
      USER_ID_FIJO,
      testIngestaBId,
      asignaciones,
    );

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

  // T19/SC-13 — RETIRADO en el tramo 5a de #778.
  //
  // Afirmaba "catálogo falla → pipeline degrada; filas de gasto quedan null,
  // ingesta continúa PROCESADA". Ese comportamiento ya no existe: con el
  // catálogo caído la ingesta se RECHAZA entera y no se persiste ninguna
  // fila.
  //
  // Se retira y no se reescribe acá por dos razones. La primera es que el
  // comportamiento nuevo ya está cubierto contra Postgres real en
  // `ingesta-preview-commit.int-spec.ts`, ejercitando `ProcessIngestaUseCase`
  // y `PreviewIngestaUseCase` de verdad.
  //
  // La segunda es la que importa: este test corría sobre
  // `runCategorizacionStep`, una REIMPLEMENTACIÓN local de la lógica del
  // pipeline que vive en este archivo, no sobre el use case real. Su propio
  // comentario prometía "the test will fail if the degrade island is
  // removed" — y cuando la isla se eliminó, siguió en VERDE, porque lo que
  // ejercitaba era su propia copia. Un guard que no guarda da confianza
  // falsa, que es peor que no tenerlo.
  //
  // Los otros tests de este archivo siguen usando ese helper para cosas que
  // sí son ciertas (aislamiento entre ingestas, integridad de FKs, patrones
  // per-user). Si alguno empieza a describir producción de forma inexacta,
  // vale el mismo criterio.

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
    const writeResult = await bucketWriter.asignarCategorizacion(
      USER_ID_FIJO,
      testIngestaBId,
      [
        {
          transaccionId: txNull.id,
          categoriaId: CATEGORIA_IDS['Necesidades:Supermercado'],
          bucket: Bucket.Necesidades,
        },
      ],
    );
    expect(writeResult.isOk()).toBe(true);

    // Verify FKs resolve correctly
    const updated = await prisma.transaccion.findUnique({
      where: { id: txNull.id },
      include: { bucket: true, categoria: true },
    });
    expect(updated?.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(updated?.bucket?.nombre).toBe(Bucket.Necesidades);
    expect(updated?.categoriaId).toBe(
      CATEGORIA_IDS['Necesidades:Supermercado'],
    );
    expect(updated?.categoria?.nombre).toBe('Supermercado');

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
    const stillNull = await prisma.transaccion.findUnique({
      where: { id: anotherNull.id },
    });
    expect(stillNull?.bucketId).toBeNull(); // null FK rows remain valid after migration
  });

  // CAT037-03: a non-seed user's ingesta is classified using ONLY their own
  // per-user catalog copy — never the bootstrap user's CATEGORIA_IDS.
  it("CAT037-03: a non-seed user's ingesta is classified using only their own patterns (real per-user ids, not CATEGORIA_IDS)", async () => {
    const nonSeedUserId = `catz-nonseed-${Date.now()}`;
    await prisma.user.create({
      data: { id: nonSeedUserId, nombre: 'Non-seed catz user' },
    });
    await crearCatalogoParaUsuario(prisma, nonSeedUserId);

    const account = await prisma.account.create({
      data: {
        userId: nonSeedUserId,
        banco: 'BancoEstado',
        tipoCuenta: 'CuentaRUT',
        numeroCuenta: crypto.encrypt(`nsu-${Date.now()}`),
      },
    });
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: nonSeedUserId,
        accountId: account.id,
        banco: 'BancoEstado',
        nombreArchivo: 'nsu-test.xlsx',
        estado: 'PROCESADA',
      },
    });
    const tx = await prisma.transaccion.create({
      data: {
        ingestaId: ingesta.id,
        accountId: account.id,
        fecha: new Date('2026-07-02'),
        descripcion: crypto.encrypt('Compra Lider'),
        cargo: 9500n,
        abono: 0n,
      },
    });

    const resumen = await runCategorizacionStep(
      ingesta.id,
      nonSeedUserId,
      catalogoRepo,
      txClasificacionReader,
      bucketWriter,
      categorizarUseCase,
    );
    expect(resumen).toBeDefined();

    const updated = await prisma.transaccion.findUniqueOrThrow({
      where: { id: tx.id },
    });
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    const supermercadoIdDeEsteUsuario = await categoriaIdDe(prisma, {
      userId: nonSeedUserId,
      bucket: Bucket.Necesidades,
      nombre: 'Supermercado',
    });
    // Resolved through THIS user's own catalog row, never the bootstrap
    // user's fixed CATEGORIA_IDS constant.
    expect(updated.categoriaId).toBe(supermercadoIdDeEsteUsuario);
    expect(updated.categoriaId).not.toBe(
      CATEGORIA_IDS['Necesidades:Supermercado'],
    );

    await prisma.transaccion.deleteMany({ where: { ingestaId: ingesta.id } });
    await prisma.ingesta.deleteMany({ where: { id: ingesta.id } });
    await prisma.account.deleteMany({ where: { id: account.id } });
    await prisma.patronClasificacion.deleteMany({
      where: { userId: nonSeedUserId },
    });
    await prisma.categoria.deleteMany({ where: { userId: nonSeedUserId } });
    await prisma.user.deleteMany({ where: { id: nonSeedUserId } });
  });
});
