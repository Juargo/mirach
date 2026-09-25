import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaDetalleBucketRepository } from '../src/infrastructure/persistence/prisma-detalle-bucket.repository';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { PeriodoMes } from '../src/domain/value-objects/periodo-mes';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';
import { buildTestEnv } from './support/env.fixture';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { categoriaIdDe } from './helpers/categoria-fixture';

/**
 * Integration tests for PrismaDetalleBucketRepository (US-017), two-user
 * pattern — mirrors movimientos-mes.int-spec.ts's AC-10 isolation test.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1. Uses a RUN_ID to
 * isolate test data and cleans up in afterAll.
 *
 * Key scenarios (ADR-015 mandate on user_id isolation for every endpoint
 * returning user data; design.md Open design question 4 confirms /resumen
 * and /movimientos already have their own isolation test — do NOT backfill,
 * this new endpoint gets its own regardless):
 *
 *   1. Isolation: a user B transaction in the queried bucket/period NEVER
 *      appears in user A's result (row-identity assertion).
 *   2. Null-fold correctness (issue #778 tramo 5b PR5, `Bucket.SinCategoria`
 *      removed from the domain): a user A transaction with bucketId = null,
 *      AND one holding the legacy physical id `bucket-sincategoria`, BOTH
 *      appear when querying Deseos, and do NOT appear when querying any
 *      other bucket — guards the SC-03 fold mirrored from
 *      prisma-resumen-mes.repository.ts (design's flagged HIGH-risk item).
 */

const RUN_ID = `detbucketint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaDetalleBucketRepository (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  // ADR-013: adapter REAL (no NoOp) para que este int-spec ejercite el
  // decrypt real — la clave de 32 bytes viene del fixture compartido
  // (test/support/env.fixture.ts), nunca hardcodeada acá.
  const crypto = new AesGcmCryptoService(
    Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
  );
  const repo = new PrismaDetalleBucketRepository(prisma, crypto);

  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;

  const periodoJulio = PeriodoMes.crear('2026-07').getValue();

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({
      data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` },
    });
    await prisma.user.create({
      data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` },
    });
    // CAT037-06 regression guard: user B needs a real catalog so a
    // categorized transaction resolves to a real Categoria, not null.
    await crearCatalogoParaUsuario(prisma, TEST_USER_ID_B);

    // US-035 Slice 2: numeroCuenta CIFRADO — findByPeriodoYBucket lo
    // descifra con `crypto` (misma clave fija de este int-spec), así que
    // sembrarlo en claro haría lanzar AesGcmCryptoService.decrypt()
    // (fail-loud, US-036).
    const accA = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_A,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: crypto.encrypt(`bci-a-${RUN_ID}`),
      },
    });
    accountIdA = accA.id;

    const accB = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_B,
        banco: 'Santander',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: crypto.encrypt(`san-b-${RUN_ID}`),
      },
    });
    accountIdB = accB.id;

    const ingA = await prisma.ingesta.create({
      data: {
        userId: TEST_USER_ID_A,
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `a-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA = ingA.id;

    const ingB = await prisma.ingesta.create({
      data: {
        userId: TEST_USER_ID_B,
        accountId: accountIdB,
        banco: 'Santander',
        nombreArchivo: `b-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdB = ingB.id;
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA, accountIdB] } },
    });
    // Composite FK (PatronClasificacion.(categoriaId,userId) → Categoria) is
    // RESTRICT — clear user B's copied catalog before deleting the user.
    await prisma.patronClasificacion.deleteMany({
      where: { userId: TEST_USER_ID_B },
    });
    await prisma.categoria.deleteMany({ where: { userId: TEST_USER_ID_B } });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_USER_ID_A, TEST_USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  const createTx = (
    accountId: string,
    ingestaId: string,
    fecha: Date,
    bucketId: string | null,
    cargo: bigint,
    abono: bigint,
    descripcion = 'Test tx',
  ) =>
    prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        fecha,
        bucketId,
        cargo,
        abono,
        // Cifrada con la MISMA clave que el repo (buildTestEnv) — decrypt()
        // ya no hace passthrough de texto plano (US-036), así que la seed
        // debe estar cifrada o findByPeriodoYBucket lanza al leerla.
        descripcion: crypto.encrypt(descripcion),
      },
    });

  it('isolation: a user B transaction in the queried bucket/period NEVER appears in user A results', async () => {
    const userBTx = await createTx(
      accountIdB,
      ingestaIdB,
      new Date('2026-07-12T00:00:00.000Z'),
      BUCKET_IDS[Bucket.Necesidades],
      99000n,
      0n,
      'UserB tx',
    );

    const rows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_A,
      periodoJulio,
      Bucket.Necesidades,
    );

    const returnedIds = rows.map((r) => r.id);
    expect(returnedIds).not.toContain(userBTx.id);
  });

  it('null-fold AND legacy-SinCategoria-fold: both appear when querying Deseos, never under any other bucket (#778 tramo 5b PR5)', async () => {
    const nullTx = await createTx(
      accountIdA,
      ingestaIdA,
      new Date('2026-07-14T00:00:00.000Z'),
      null,
      42000n,
      0n,
      'Sin bucket asignado',
    );
    // issue #778 tramo 5b PR5 removed Bucket.SinCategoria from the domain —
    // a row still holding this legacy physical id is an unrecognized
    // bucketId that ALSO folds to Deseos, exactly like null.
    const legacySinCategoriaTx = await createTx(
      accountIdA,
      ingestaIdA,
      new Date('2026-07-15T00:00:00.000Z'),
      'bucket-sincategoria',
      13000n,
      0n,
      'Bucket legacy SinCategoria',
    );

    const idsDe = async (bucket: Bucket) =>
      (
        await repo.findByPeriodoYBucket(TEST_USER_ID_A, periodoJulio, bucket)
      ).map((r) => r.id);

    const deseosIds = await idsDe(Bucket.Deseos);
    expect(deseosIds).toContain(nullTx.id);
    expect(deseosIds).toContain(legacySinCategoriaTx.id);
    // Neither fold source leaks into an unrelated bucket's drill-down.
    const necesidadesIds = await idsDe(Bucket.Necesidades);
    expect(necesidadesIds).not.toContain(nullTx.id);
    expect(necesidadesIds).not.toContain(legacySinCategoriaTx.id);
  });

  it("null-fold: a bucketId=null row in the Deseos drill-down carries the user's internal Desconocido category (#778 tramo 5b)", async () => {
    const desconocidoIdB = await categoriaIdDe(prisma, {
      userId: TEST_USER_ID_B,
      bucket: Bucket.Deseos,
      nombre: 'Desconocido',
    });
    const nullTx = await createTx(
      accountIdB,
      ingestaIdB,
      new Date('2026-07-16T00:00:00.000Z'),
      null,
      13000n,
      0n,
      'UserB sin bucket propio',
    );

    const rows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_B,
      periodoJulio,
      Bucket.Deseos,
    );
    const found = rows.find((r) => r.id === nullTx.id);
    expect(found).toBeDefined();
    expect(found!.categoria).toMatchObject({
      id: desconocidoIdB,
      nombre: 'Desconocido',
    });
  });

  it('isolation on the null-fold path: a user B transaction with bucketId=null NEVER leaks into user A Deseos results', async () => {
    // Regression guard for the highest-risk path: the Deseos OR-fold
    // (bucketId IS NULL OR bucketId = 'bucket-deseos') must stay ANDed
    // under account.userId. A future refactor that floats the OR to the top
    // of the `where` would leak another user's null-bucket rows — this case
    // fails loudly if that happens.
    const userBNullTx = await createTx(
      accountIdB,
      ingestaIdB,
      new Date('2026-07-18T00:00:00.000Z'),
      null,
      55000n,
      0n,
      'UserB sin bucket',
    );

    const deseosRows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_A,
      periodoJulio,
      Bucket.Deseos,
    );

    const returnedIds = deseosRows.map((r) => r.id);
    expect(returnedIds).not.toContain(userBNullTx.id);
  });

  it('CAT037-06: a second, non-seed user (B) sees their real categoria on a categorized transaction, not null', async () => {
    const streamingIdB = await categoriaIdDe(prisma, {
      userId: TEST_USER_ID_B,
      bucket: Bucket.Deseos,
      nombre: 'Streaming',
    });
    const tx = await createTx(
      accountIdB,
      ingestaIdB,
      new Date('2026-07-20T00:00:00.000Z'),
      BUCKET_IDS[Bucket.Deseos],
      8000n,
      0n,
      'Netflix suscripcion',
    );
    await prisma.transaccion.update({
      where: { id: tx.id },
      data: { categoriaId: streamingIdB },
    });

    const rows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_B,
      periodoJulio,
      Bucket.Deseos,
    );
    const found = rows.find((r) => r.id === tx.id);
    expect(found).toBeDefined();
    // The template seeds Streaming with its default icon (CATICO-04), and the
    // repository row now carries it (MBD-02).
    expect(found!.categoria).toEqual({
      id: streamingIdB,
      nombre: 'Streaming',
      icono: 'tv',
    });
  });
});
