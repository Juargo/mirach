/**
 * Integration tests for PrismaDetalleBucketRepository (US-017).
 *
 * Requires a real DB connection. Run via `pnpm api test:integration`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds and cleans up its own rows.
 * Mirrors PrismaResumenMesRepository's colocated-spec convention: when
 * ALLOW_DESTRUCTIVE_DB is unset, every assertion body short-circuits so the
 * file still typechecks and passes as a no-op inside `pnpm api test`.
 *
 * Covered scenarios (guards the design's flagged HIGH-risk correctness item):
 *   - SC-01: valid bucket returns only rows matching that bucket, in the period window
 *   - SC-03: SinCategoria null-fold — a null-bucketId row AND a real
 *     'bucket-sincategoria' row BOTH appear when querying SinCategoria, and
 *     NEITHER appears when querying a different bucket
 *   - CA-03: half-open [desde, hasta) window (desde inclusive, hasta exclusive)
 *   - User isolation (RNF-SEC-006): user B's data must NOT bleed into user A
 *   - Ordering: fecha asc, id asc tiebreak
 */
import { PrismaService } from './prisma.service';
import { PrismaDetalleBucketRepository } from './prisma-detalle-bucket.repository';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';

const RUN_ID = `detalle-bucket-repo-${Date.now()}`;
const PERIODO = '2026-07';

describe('PrismaDetalleBucketRepository (integration)', () => {
  let prisma: PrismaService;
  let repo: PrismaDetalleBucketRepository;
  let periodoVO: PeriodoMes;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaDetalleBucketRepository(prisma);
    periodoVO = PeriodoMes.crear(PERIODO).getValue() as PeriodoMes;
  });

  afterAll(async () => {
    if (!ALLOW) return;
    if (createdAccountIds.length > 0) {
      await prisma.transaccion.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
    await prisma.$disconnect();
  });

  /** Helper: seed an ingesta row (required FK for transacciones). */
  async function seedIngesta(accountId: string, suffix: string): Promise<string> {
    const ingestaId = `${RUN_ID}-ingesta-${suffix}`;
    await prisma.ingesta.upsert({
      where: { id: ingestaId },
      update: {},
      create: {
        id: ingestaId,
        accountId,
        banco: 'TestBank',
        nombreArchivo: `test-${suffix}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    return ingestaId;
  }

  /** Helper: seed a transaccion row. */
  async function seedTransaccion(opts: {
    accountId: string;
    ingestaId: string;
    bucketId: string | null;
    cargo: bigint;
    abono: bigint;
    fecha?: Date;
  }): Promise<string> {
    const tx = await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: opts.bucketId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: opts.fecha ?? new Date('2026-07-10T00:00:00.000Z'),
        descripcion: 'Test tx',
      },
    });
    return tx.id;
  }

  // ─── SC-01: filters by bucket + isolation fields present ──────────────────

  it('SC-01: returns only rows matching the queried bucket, with bank/account fields', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc01`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc01' },
    });
    const accountId = `${RUN_ID}-account-sc01`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc01',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'sc01');

    const necId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 50_000n,
      abono: 0n,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 20_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(userId, periodoVO, Bucket.Necesidades);

    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(necId);
    expect(rows[0]!.banco).toBe('TestBank');
    expect(rows[0]!.tipoCuenta).toBe('CuentaCorriente');
    expect(rows[0]!.numeroCuenta).toBe('ACC-sc01');
  });

  // ─── SC-03: SinCategoria null-fold (HIGHEST RISK) ─────────────────────────

  it('SC-03: SinCategoria query returns BOTH null-bucketId AND real SinCategoria rows', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc03`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc03' },
    });
    const accountId = `${RUN_ID}-account-sc03`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc03',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'sc03');

    const nullId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 150_000n,
      abono: 0n,
    });
    const sinCategoriaId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.SinCategoria],
      cargo: 50_000n,
      abono: 0n,
    });
    const necId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 10_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(userId, periodoVO, Bucket.SinCategoria);
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(nullId);
    expect(ids).toContain(sinCategoriaId);
    expect(ids).not.toContain(necId);

    // Querying a DIFFERENT bucket must NOT include the null-fold rows.
    const necRows = await repo.findByPeriodoYBucket(userId, periodoVO, Bucket.Necesidades);
    const necIds = necRows.map((r) => r.id);
    expect(necIds).not.toContain(nullId);
    expect(necIds).not.toContain(sinCategoriaId);
  });

  // ─── CA-03: half-open window ───────────────────────────────────────────────

  it('CA-03: row at desde (2026-07-01T00:00:00.000Z) INCLUDED; row at hasta (2026-08-01) EXCLUDED', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-ca03`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User ca03' },
    });
    const accountId = `${RUN_ID}-account-ca03`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-ca03',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'ca03');

    const firstId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 1_000n,
      abono: 0n,
      fecha: new Date('2026-07-01T00:00:00.000Z'),
    });
    const augId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 2_000n,
      abono: 0n,
      fecha: new Date('2026-08-01T00:00:00.000Z'),
    });

    const rows = await repo.findByPeriodoYBucket(userId, periodoVO, Bucket.Necesidades);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(firstId);
    expect(ids).not.toContain(augId);
  });

  // ─── User isolation (RNF-SEC-006) ─────────────────────────────────────────

  it('user isolation: user B rows NEVER appear in user A results', async () => {
    if (!ALLOW) return;

    const userIdA = `${RUN_ID}-user-iso-A`;
    const userIdB = `${RUN_ID}-user-iso-B`;
    await prisma.user.upsert({
      where: { id: userIdA },
      update: {},
      create: { id: userIdA, nombre: 'Test User iso A' },
    });
    await prisma.user.upsert({
      where: { id: userIdB },
      update: {},
      create: { id: userIdB, nombre: 'Test User iso B' },
    });
    const accountIdA = `${RUN_ID}-account-iso-A`;
    const accountIdB = `${RUN_ID}-account-iso-B`;
    await prisma.account.upsert({
      where: { id: accountIdA },
      update: {},
      create: {
        id: accountIdA,
        userId: userIdA,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-iso-A',
      },
    });
    await prisma.account.upsert({
      where: { id: accountIdB },
      update: {},
      create: {
        id: accountIdB,
        userId: userIdB,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-iso-B',
      },
    });
    createdAccountIds.push(accountIdA, accountIdB);
    const ingestaIdA = await seedIngesta(accountIdA, 'iso-A');
    const ingestaIdB = await seedIngesta(accountIdB, 'iso-B');

    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 500_000n,
      abono: 0n,
    });
    const userBTxId = await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 4_500_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(userIdA, periodoVO, Bucket.Necesidades);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(userBTxId);
  });

  // ─── Ordering ───────────────────────────────────────────────────────────

  it('ordering: rows ordered by fecha asc then id asc as tiebreak', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-order`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User order' },
    });
    const accountId = `${RUN_ID}-account-order`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-order',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'order');

    const earlierId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 200n,
      abono: 0n,
      fecha: new Date('2026-07-05T00:00:00.000Z'),
    });
    const sameDateId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 150n,
      abono: 0n,
      fecha: new Date('2026-07-05T00:00:00.000Z'),
    });
    const laterId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 100n,
      abono: 0n,
      fecha: new Date('2026-07-20T00:00:00.000Z'),
    });

    const rows = await repo.findByPeriodoYBucket(userId, periodoVO, Bucket.Deseos);

    const earlierIdx = rows.findIndex((r) => r.id === earlierId);
    const sameDateIdx = rows.findIndex((r) => r.id === sameDateId);
    const laterIdx = rows.findIndex((r) => r.id === laterId);

    expect(earlierIdx).toBeLessThan(laterIdx);
    expect(earlierIdx).toBeLessThan(sameDateIdx);
    expect(sameDateIdx).toBeLessThan(laterIdx);
  });
});
