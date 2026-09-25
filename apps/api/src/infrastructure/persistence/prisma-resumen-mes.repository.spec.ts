/**
 * Integration tests for PrismaResumenMesRepository (T-07, extended by US-045).
 *
 * Requires a real DB connection. Run via `pnpm api test:integration`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds and cleans up its own rows.
 * Each test uses per-run unique account ids to avoid cross-test pollution.
 *
 * Covered scenarios:
 *   - groupBy correctness (SC-01): per-bucket cargo/abono sums + cantidadCargos
 *   - null→Deseos AND legacy-bucket-sincategoria→Deseos fold (SC-03, issue
 *     #778 tramo 5b PR5): HIGHEST RISK — `Bucket.SinCategoria` was removed
 *     from the domain, so a row still holding the legacy physical id
 *     `bucket-sincategoria` is now an unrecognized bucketId that folds into
 *     Deseos, exactly like null; within each group, multiple matching rows
 *     (null, the legacy id, AND the real bucket-deseos id) are still ADDED,
 *     never overwritten (sums AND counts) — no double count, no loss
 *   - Grand-total invariant: the sum of totalCargo across all 4 buckets
 *     equals the total cargo of every seeded row, regardless of how many
 *     have a null or legacy-SinCategoria bucketId (no double count, no loss)
 *   - Empty month (SC-05): no rows → all buckets 0n / 0 cantidadCargos
 *   - No-income month (SC-04): spends present but Ingreso row absent
 *   - User isolation (SC-09, RNF-SEC-006): user B's data must NOT bleed into
 *     user A (sums AND cantidadCargos)
 *   - Cargos-only count (SC-10, US-045 D-05 R-2): an uncategorized abono row
 *     must NOT be counted, and must NOT corrupt totalAbono — proves the
 *     `cargo: { gt: 0 }` filter is scoped to the count query only
 */
import { PrismaClient } from '@prisma/client';
import { PrismaResumenMesRepository } from './prisma-resumen-mes.repository';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS, ID_BUCKET_SINCATEGORIA_LEGACY } from './bucket-ids';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';

const RUN_ID = `resumen-repo-${Date.now()}`;
const PERIODO = '2026-07';

describe('PrismaResumenMesRepository (integration)', () => {
  let prisma: PrismaClient;
  let repo: PrismaResumenMesRepository;
  let periodoVO: PeriodoMes;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaResumenMesRepository(prisma);
    periodoVO = PeriodoMes.crear(PERIODO).getValue();
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
  async function seedIngesta(
    accountId: string,
    suffix: string,
  ): Promise<string> {
    const ingestaId = `${RUN_ID}-ingesta-${suffix}`;
    // Same userId derivation as seedAccount — the owning user for this suffix.
    const userId = `${RUN_ID}-user-${suffix}`;
    await prisma.ingesta.upsert({
      where: { id: ingestaId },
      update: {},
      create: {
        id: ingestaId,
        userId,
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

    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_500_000n,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 750_000n,
      abono: 0n,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 360_000n,
      abono: 0n,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ahorro],
      cargo: 300_000n,
      abono: 0n,
    });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    expect(byBucket.get(Bucket.Ingreso)?.totalAbono).toBe(1_500_000n);
    expect(byBucket.get(Bucket.Necesidades)?.totalCargo).toBe(750_000n);
    expect(byBucket.get(Bucket.Deseos)?.totalCargo).toBe(360_000n);
    expect(byBucket.get(Bucket.Ahorro)?.totalCargo).toBe(300_000n);

    // US-045 SC-01 extended: per-bucket cargo counts match the seeded cargo
    // rows. Ingreso's only row is an abono, so its count must be 0.
    expect(byBucket.get(Bucket.Ingreso)?.cantidadCargos).toBe(0);
    expect(byBucket.get(Bucket.Necesidades)?.cantidadCargos).toBe(1);
    expect(byBucket.get(Bucket.Deseos)?.cantidadCargos).toBe(1);
    expect(byBucket.get(Bucket.Ahorro)?.cantidadCargos).toBe(1);
  });

  // ─── SC-03: null→Deseos AND legacy-SinCategoria→Deseos fold (issue #778 tramo 5b PR5, HIGHEST RISK) ──────────

  it('SC-03: null bucketId AND the legacy bucket-sincategoria id BOTH fold into Deseos, adding with the real Deseos row — no double count, no loss', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc03');
    const userId = `${RUN_ID}-user-sc03`;
    const ingestaId = await seedIngesta(accountId, 'sc03');

    // null-bucket row: cargo=150_000n — folds to Deseos
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 150_000n,
      abono: 0n,
    });
    // legacy bucket-sincategoria row: cargo=50_000n — issue #778 tramo 5b
    // PR5 removed Bucket.SinCategoria from the domain, so this physical id
    // is now just another unrecognized bucketId. It ALSO folds to Deseos.
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: ID_BUCKET_SINCATEGORIA_LEGACY,
      cargo: 50_000n,
      abono: 0n,
    });
    // real Deseos row: cargo=20_000n — must ADD with both fold sources
    // above, not be overwritten by either (SC-03's ADD-not-overwrite rule).
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 20_000n,
      abono: 0n,
    });
    // Income for context
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
    });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // CRITICAL: Deseos = 150_000 (null-fold) + 50_000 (legacy SinCategoria
    // id) + 20_000 (real Deseos) = 220_000. Splitting the legacy id back
    // into its own group (the pre-PR5 behavior) would make this assert red.
    expect(byBucket.get(Bucket.Deseos)?.totalCargo).toBe(220_000n);
    expect(byBucket.get(Bucket.Deseos)?.cantidadCargos).toBe(3);
    // No 5th bucket appears anywhere — every row landed in exactly one of
    // the 4 real buckets.
    expect(rows).toHaveLength(4);
  });

  it('grand-total invariant: summing totalCargo across all 4 buckets equals the total cargo seeded (no double count, no loss)', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc03-invariante');
    const userId = `${RUN_ID}-user-sc03-invariante`;
    const ingestaId = await seedIngesta(accountId, 'sc03-invariante');

    const cargos = [
      { bucketId: BUCKET_IDS[Bucket.Necesidades], cargo: 500_000n },
      { bucketId: BUCKET_IDS[Bucket.Deseos], cargo: 200_000n },
      { bucketId: BUCKET_IDS[Bucket.Ahorro], cargo: 300_000n },
      { bucketId: ID_BUCKET_SINCATEGORIA_LEGACY, cargo: 50_000n }, // legacy id → folds to Deseos
      { bucketId: null, cargo: 150_000n },
      { bucketId: null, cargo: 25_000n },
      { bucketId: 'not-a-real-bucket-id', cargo: 5_000n }, // integrity anomaly → also Deseos
    ] as const;
    let totalSeeded = 0n;
    for (const { bucketId, cargo } of cargos) {
      await seedTransaccion({
        accountId,
        ingestaId,
        bucketId,
        cargo,
        abono: 0n,
      });
      totalSeeded += cargo;
    }

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const totalLeido = rows.reduce((acc, r) => acc + r.totalCargo, 0n);

    expect(totalLeido).toBe(totalSeeded);

    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    // Sharpen: Deseos alone = 200_000 (real) + 50_000 (legacy SinCategoria
    // id) + 150_000 + 25_000 (nulls) + 5_000 (anomaly) = 430_000 — proves
    // the invariant isn't passing by a loss-in-one/gain-in-another
    // coincidence.
    expect(byBucket.get(Bucket.Deseos)?.totalCargo).toBe(430_000n);
  });

  // ─── SC-10: cargos-only count, does not leak into sums (US-045 D-05 R-2) ──

  it('SC-10: an uncategorized abono row is not counted, and does not corrupt totalAbono', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc10');
    const userId = `${RUN_ID}-user-sc10`;
    const ingestaId = await seedIngesta(accountId, 'sc10');

    // Uncategorized cargo row — counted.
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 20_000n,
      abono: 0n,
    });
    // Uncategorized abono row — NOT counted, and must not corrupt totalAbono.
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 0n,
      abono: 50_000n,
    });

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // Only the cargo row is counted — the abono row is excluded by the
    // `cargo: { gt: 0 }` scope of the count query. Both rows have a null
    // bucketId, so they fold to Deseos (issue #778 tramo 5b), not SinCategoria.
    expect(byBucket.get(Bucket.Deseos)?.cantidadCargos).toBe(1);
    // The sums query must be untouched by the count query's filter — this is
    // the assert that catches `cargo: { gt: 0 }` leaking into the sums
    // `where` and silently dropping the abono from totalAbono (R-2).
    expect(byBucket.get(Bucket.Deseos)?.totalAbono).toBe(50_000n);
  });

  // ─── SC-05: empty month ────────────────────────────────────────────────────

  it('SC-05: empty month → all 4 buckets return 0n', async () => {
    if (!ALLOW) return;

    await seedAccount('sc05');
    const userId = `${RUN_ID}-user-sc05`;
    // No transactions seeded for this user

    const rows = await repo.sumarPorBucket(userId, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // All 4 buckets should be present with 0n
    for (const bucket of Object.values(Bucket)) {
      expect(byBucket.get(bucket)?.totalCargo).toBe(0n);
      expect(byBucket.get(bucket)?.totalAbono).toBe(0n);
      // US-045 SC-05 extended: cantidadCargos is also present and 0.
      expect(byBucket.get(bucket)?.cantidadCargos).toBe(0);
    }
  });

  // ─── SC-04: no-income month ────────────────────────────────────────────────

  it('SC-04: no-income month → Ingreso totalAbono = 0n, spend totals present', async () => {
    if (!ALLOW) return;

    const accountId = await seedAccount('sc04');
    const userId = `${RUN_ID}-user-sc04`;
    const ingestaId = await seedIngesta(accountId, 'sc04');

    // Spend only, no Ingreso row
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 100_000n,
      abono: 0n,
    });

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
    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
    });
    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 500_000n,
      abono: 0n,
    });
    // User A: 1 uncategorized cargo — distinct count from B's, for the
    // US-045 cantidadCargos isolation delta (ISO-02).
    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: null,
      cargo: 10_000n,
      abono: 0n,
    });

    // User B: Ingreso=9_000_000, Necesidades=4_500_000 — must NOT appear in A's query
    await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 9_000_000n,
    });
    await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 4_500_000n,
      abono: 0n,
    });
    // User B: 2 uncategorized cargos — must NOT bleed into A's count.
    await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: null,
      cargo: 20_000n,
      abono: 0n,
    });
    await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: null,
      cargo: 30_000n,
      abono: 0n,
    });

    const rows = await repo.sumarPorBucket(userIdA, periodoVO);
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // User A sees ONLY user A's data
    expect(byBucket.get(Bucket.Ingreso)?.totalAbono).toBe(1_000_000n); // NOT 10_000_000n
    expect(byBucket.get(Bucket.Necesidades)?.totalCargo).toBe(500_000n); // NOT 5_000_000n
    // US-045 SC-09 extended: A's cantidadCargos is A's own count (1), never
    // B's (2) nor the A+B sum (3). Null bucketId folds to Deseos (#778 tramo 5b).
    expect(byBucket.get(Bucket.Deseos)?.cantidadCargos).toBe(1);
  });
});
