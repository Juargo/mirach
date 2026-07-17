import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { PrismaDetalleBucketRepository } from '../src/infrastructure/persistence/prisma-detalle-bucket.repository';
import { PeriodoMes } from '../src/domain/value-objects/periodo-mes';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

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
 *   2. Null-fold correctness: a user A transaction with bucketId = null
 *      appears when querying SinCategoria, and does NOT appear when
 *      querying any other bucket — guards the SC-03 fold mirrored from
 *      prisma-resumen-mes.repository.ts (design's flagged HIGH-risk item).
 */

const RUN_ID = `detbucketint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaDetalleBucketRepository (integration — real dev DB)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaDetalleBucketRepository(prisma);

  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;

  const periodoJulio = PeriodoMes.crear('2026-07').getValue();

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({ data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` } });
    await prisma.user.create({ data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` } });

    const accA = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_A,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-a-${RUN_ID}`,
      },
    });
    accountIdA = accA.id;

    const accB = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_B,
        banco: 'Santander',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `san-b-${RUN_ID}`,
      },
    });
    accountIdB = accB.id;

    const ingA = await prisma.ingesta.create({
      data: {
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `a-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA = ingA.id;

    const ingB = await prisma.ingesta.create({
      data: {
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
      data: { accountId, ingestaId, fecha, bucketId, cargo, abono, descripcion },
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

    const rows = await repo.findByPeriodoYBucket(TEST_USER_ID_A, periodoJulio, Bucket.Necesidades);

    const returnedIds = rows.map((r) => r.id);
    expect(returnedIds).not.toContain(userBTx.id);
  });

  it('null-fold: a user A transaction with bucketId=null appears when querying SinCategoria, not when querying another bucket', async () => {
    const nullTx = await createTx(
      accountIdA,
      ingestaIdA,
      new Date('2026-07-14T00:00:00.000Z'),
      null,
      42000n,
      0n,
      'Sin bucket asignado',
    );

    const sinCategoriaRows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_A,
      periodoJulio,
      Bucket.SinCategoria,
    );
    const sinCategoriaIds = sinCategoriaRows.map((r) => r.id);
    expect(sinCategoriaIds).toContain(nullTx.id);

    const necesidadesRows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_A,
      periodoJulio,
      Bucket.Necesidades,
    );
    const necesidadesIds = necesidadesRows.map((r) => r.id);
    expect(necesidadesIds).not.toContain(nullTx.id);
  });

  it('isolation on the null-fold path: a user B transaction with bucketId=null NEVER leaks into user A SinCategoria results', async () => {
    // Regression guard for the highest-risk path: the SinCategoria OR-fold
    // (bucketId IS NULL OR bucketId = 'bucket-sincategoria') must stay ANDed
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

    const sinCategoriaRows = await repo.findByPeriodoYBucket(
      TEST_USER_ID_A,
      periodoJulio,
      Bucket.SinCategoria,
    );

    const returnedIds = sinCategoriaRows.map((r) => r.id);
    expect(returnedIds).not.toContain(userBNullTx.id);
  });
});
