/**
 * Integration tests for PrismaResumenMesRepository (T-07).
 *
 * Requires a real DB connection. Run via `pnpm api test:integration`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds and cleans up its own rows.
 * Each test uses per-run unique account ids to avoid cross-test pollution.
 *
 * Covered scenarios:
 *   - groupBy correctness (SC-01): per-bucket cargo/abono sums
 *   - null→SinCategoria fold (SC-03): HIGHEST RISK — both null-bucket and
 *     real SinCategoria rows MUST be ADDED, not overwritten
 *   - Empty month (SC-05): no rows → all buckets 0n
 *   - No-income month (SC-04): spends present but Ingreso row absent
 *   - User isolation (SC-09, RNF-SEC-006): user B's data must NOT bleed into user A
 */
import { PrismaService } from './prisma.service';
import { PrismaResumenMesRepository } from './prisma-resumen-mes.repository';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';

const RUN_ID = `resumen-repo-${Date.now()}`;
const PERIODO = '2026-07';

describe('PrismaResumenMesRepository (integration)', () => {
  let prisma: PrismaService;
  let repo: PrismaResumenMesRepository;
  let periodoVO: PeriodoMes;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaResumenMesRepository(prisma);
    periodoVO = PeriodoMes.crear(PERIODO).getValue() as PeriodoMes;
  });

  afterAll(async () => {
    if (!ALLOW) return;
    // Clean up all seeded accounts (cascade deletes transacciones too)
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

  /** Helper: upsert a user + account and return accountId. */
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
  }): Promise<void> {
    await prisma.transaccion.create({
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
  }

  // ─── SC-01: groupBy correctness ────────────────────────────────────────────

  it('SC-01: returns correct per-bucket cargo/abono sums for a multi-bucket month', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc01');
    const userId = `${RUN_ID}-user-sc01`;
    const ingestaId = await seedIngesta(accountId, 'sc01');

    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Ingreso],      cargo: 0n,         abono: 1_500_000n });
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Necesidades],  cargo: 750_000n,   abono: 0n });
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Deseos],       cargo: 360_000n,   abono: 0n });
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Ahorro],       cargo: 300_000n,   abono: 0n });
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.SinCategoria], cargo: 90_000n,    abono: 0n });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    expect(byBucket.get(Bucket.Ingreso)?.totalAbono).toBe(1_500_000n);
    expect(byBucket.get(Bucket.Necesidades)?.totalCargo).toBe(750_000n);
    expect(byBucket.get(Bucket.Deseos)?.totalCargo).toBe(360_000n);
    expect(byBucket.get(Bucket.Ahorro)?.totalCargo).toBe(300_000n);
    expect(byBucket.get(Bucket.SinCategoria)?.totalCargo).toBe(90_000n);
  });

  // ─── SC-03: null→SinCategoria fold (HIGHEST RISK) ─────────────────────────

  it('SC-03: null bucketId AND real SinCategoria both fold into SinCategoria (ADDED, not overwritten)', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc03');
    const userId = `${RUN_ID}-user-sc03`;
    const ingestaId = await seedIngesta(accountId, 'sc03');

    // null-bucket row: cargo=150_000n
    await seedTransaccion({ accountId, ingestaId, bucketId: null,                             cargo: 150_000n, abono: 0n });
    // real SinCategoria row: cargo=50_000n
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.SinCategoria], cargo: 50_000n,  abono: 0n });
    // Income for context
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Ingreso],       cargo: 0n,       abono: 1_000_000n });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // CRITICAL: must be 150000 + 50000 = 200000, not just one of them
    expect(byBucket.get(Bucket.SinCategoria)?.totalCargo).toBe(200_000n);
  });

  // ─── SC-05: empty month ────────────────────────────────────────────────────

  it('SC-05: empty month → all 5 buckets return 0n', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc05');
    const userId = `${RUN_ID}-user-sc05`;
    // No transactions seeded for this user

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // All 5 buckets should be present with 0n
    for (const bucket of Object.values(Bucket)) {
      expect(byBucket.get(bucket)?.totalCargo).toBe(0n);
      expect(byBucket.get(bucket)?.totalAbono).toBe(0n);
    }
  });

  // ─── SC-04: no-income month ────────────────────────────────────────────────

  it('SC-04: no-income month → Ingreso totalAbono = 0n, spend totals present', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc04');
    const userId = `${RUN_ID}-user-sc04`;
    const ingestaId = await seedIngesta(accountId, 'sc04');

    // Spend only, no Ingreso row
    await seedTransaccion({ accountId, ingestaId, bucketId: BUCKET_IDS[Bucket.Necesidades], cargo: 100_000n, abono: 0n });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    expect(byBucket.get(Bucket.Ingreso)?.totalAbono).toBe(0n);
    expect(byBucket.get(Bucket.Necesidades)?.totalCargo).toBe(100_000n);
  });

  // ─── SC-09: user isolation (MANDATORY, RNF-SEC-006) ───────────────────────

  it('SC-09: user B transactions in same period do NOT bleed into user A query', async () => {
    if (!ALLOW) return;

    const accountIdA = await seedAccount('sc09-A');
    const userIdA = `${RUN_ID}-user-sc09-A`;
    const ingestaIdA = await seedIngesta(accountIdA, 'sc09-A');

    const accountIdB = await seedAccount('sc09-B');
    const ingestaIdB = await seedIngesta(accountIdB, 'sc09-B');

    // User A: Ingreso=1_000_000, Necesidades=500_000
    await seedTransaccion({ accountId: accountIdA, ingestaId: ingestaIdA, bucketId: BUCKET_IDS[Bucket.Ingreso],     cargo: 0n,         abono: 1_000_000n });
    await seedTransaccion({ accountId: accountIdA, ingestaId: ingestaIdA, bucketId: BUCKET_IDS[Bucket.Necesidades], cargo: 500_000n,   abono: 0n });

    // User B: Ingreso=9_000_000, Necesidades=4_500_000 — must NOT appear in A's query
    await seedTransaccion({ accountId: accountIdB, ingestaId: ingestaIdB, bucketId: BUCKET_IDS[Bucket.Ingreso],     cargo: 0n,         abono: 9_000_000n });
    await seedTransaccion({ accountId: accountIdB, ingestaId: ingestaIdB, bucketId: BUCKET_IDS[Bucket.Necesidades], cargo: 4_500_000n, abono: 0n });

    const rows = await repo.sumarPorBucket(userIdA, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // User A sees ONLY user A's data
    expect(byBucket.get(Bucket.Ingreso)?.totalAbono).toBe(1_000_000n);      // NOT 10_000_000n
    expect(byBucket.get(Bucket.Necesidades)?.totalCargo).toBe(500_000n);    // NOT 5_000_000n
  });
});
