/**
 * Integration tests for PrismaResumenAnualRepository (US-030 Slice A).
 *
 * Requires a real DB connection. Run via `pnpm api test:integration`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds and cleans up its own rows.
 * Mirrors prisma-resumen-mes.repository.spec.ts.
 *
 * Covered scenarios:
 *   - Single-query aggregation (SC-01): per-(month, bucket) cargo/abono sums
 *     across the whole year, in one repository call.
 *   - null→SinCategoria fold (SC-03): same fold rule as the monthly repo —
 *     null-bucket and real SinCategoria rows MUST be ADDED, not overwritten.
 *   - Empty year (SC-05): no rows → all 12 months × 5 buckets return 0n.
 *   - User isolation (SC-09, RNF-SEC-006): user B's data must NOT bleed into
 *     user A's annual query.
 */
import { PrismaService } from './prisma.service';
import { PrismaResumenAnualRepository } from './prisma-resumen-anual.repository';
import { PeriodoAnio } from '../../domain/value-objects/periodo-anio';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';

const RUN_ID = `resumen-anual-repo-${Date.now()}`;
const ANIO = 2026;

describe('PrismaResumenAnualRepository (integration)', () => {
  let prisma: PrismaService;
  let repo: PrismaResumenAnualRepository;
  let anioVO: PeriodoAnio;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaResumenAnualRepository(prisma);
    anioVO = PeriodoAnio.crear(ANIO).getValue() as PeriodoAnio;
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

  async function seedAccount(suffix: string): Promise<string> {
    const userId = `${RUN_ID}-user-${suffix}`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: `Test User ${suffix}` },
    });
    const accountId = `${RUN_ID}-account-${suffix}`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: `ACC-${suffix}`,
      },
    });
    createdAccountIds.push(accountId);
    return accountId;
  }

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

  async function seedTransaccion(opts: {
    accountId: string;
    ingestaId: string;
    bucketId: string | null;
    cargo: bigint;
    abono: bigint;
    fecha: Date;
  }): Promise<void> {
    await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: opts.bucketId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: opts.fecha,
        descripcion: 'Test tx',
      },
    });
  }

  // ─── SC-01: single-query aggregation across months ────────────────────────

  it('SC-01: returns correct per-(month, bucket) cargo/abono sums across the year', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc01');
    const userId = `${RUN_ID}-user-sc01`;
    const ingestaId = await seedIngesta(accountId, 'sc01');

    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_500_000n,
      fecha: new Date(Date.UTC(ANIO, 0, 10)), // January
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 750_000n,
      abono: 0n,
      fecha: new Date(Date.UTC(ANIO, 5, 10)), // June
    });

    const rows = await repo.sumarPorBucketAnual(userId, anioVO);
    const enero = rows.find(
      (r) => r.mes === `${ANIO}-01` && r.bucket === Bucket.Ingreso,
    );
    const junio = rows.find(
      (r) => r.mes === `${ANIO}-06` && r.bucket === Bucket.Necesidades,
    );

    expect(enero?.totalAbono).toBe(1_500_000n);
    expect(junio?.totalCargo).toBe(750_000n);
  });

  // ─── SC-03: null→SinCategoria fold (HIGHEST RISK) ─────────────────────────

  it('SC-03: null bucketId AND real SinCategoria both fold into SinCategoria for that month (ADDED, not overwritten)', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc03');
    const userId = `${RUN_ID}-user-sc03`;
    const ingestaId = await seedIngesta(accountId, 'sc03');

    const fecha = new Date(Date.UTC(ANIO, 2, 10)); // March
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 150_000n,
      abono: 0n,
      fecha,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.SinCategoria],
      cargo: 50_000n,
      abono: 0n,
      fecha,
    });

    const rows = await repo.sumarPorBucketAnual(userId, anioVO);
    const marzo = rows.find(
      (r) => r.mes === `${ANIO}-03` && r.bucket === Bucket.SinCategoria,
    );

    expect(marzo?.totalCargo).toBe(200_000n);
  });

  // ─── SC-05: empty year ─────────────────────────────────────────────────────

  it('SC-05: empty year → all 12 months × 5 buckets return 0n', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc05-nonexistent`;
    const rows = await repo.sumarPorBucketAnual(userId, anioVO);

    expect(rows).toHaveLength(60); // 12 months × 5 buckets
    for (const row of rows) {
      expect(row.totalCargo).toBe(0n);
      expect(row.totalAbono).toBe(0n);
    }
  });

  // ─── SC-09: user isolation (MANDATORY, RNF-SEC-006) ───────────────────────

  it('SC-09: user B transactions in the same year do NOT bleed into user A query', async () => {
    if (!ALLOW) return;

    const accountIdA = await seedAccount('sc09-A');
    const userIdA = `${RUN_ID}-user-sc09-A`;
    const ingestaIdA = await seedIngesta(accountIdA, 'sc09-A');

    const accountIdB = await seedAccount('sc09-B');
    const ingestaIdB = await seedIngesta(accountIdB, 'sc09-B');

    const fecha = new Date(Date.UTC(ANIO, 3, 10)); // April

    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
      fecha,
    });
    await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 9_000_000n,
      fecha,
    });

    const rows = await repo.sumarPorBucketAnual(userIdA, anioVO);
    const abril = rows.find(
      (r) => r.mes === `${ANIO}-04` && r.bucket === Bucket.Ingreso,
    );

    expect(abril?.totalAbono).toBe(1_000_000n); // NOT 10_000_000n
  });
});
