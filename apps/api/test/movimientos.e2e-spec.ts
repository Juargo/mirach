import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';

const RUN_ID = `movmese2e-${Date.now()}`;
const API_KEY = process.env.API_KEY ?? '';

// Use a unique user per run to keep test data isolated from other runs/users.
// We derive a unique userId so tests don't contaminate USER_ID_FIJO's real data.
const TEST_USER_ID = `movmese2e-user-${RUN_ID}`;

/**
 * E2E tests for GET /api/movimientos (US-014).
 *
 * Runs the full NestJS app via supertest against a real dev DB.
 * Requires ALLOW_DESTRUCTIVE_DB=1 (set by test:e2e script).
 *
 * NOTE: Because MovimientosModule uses USER_ID_FIJO (the fixed constant),
 * we seed data under USER_ID_FIJO for happy-path tests, and rely on the
 * RUN_ID suffix for the actual unique identificaiton of the rows in cleanup.
 *
 * Scenarios tested:
 *   - 400 for invalid periodo values (AC-05, AC-07)
 *   - 200 with empty envelope for valid pero empty month
 *   - 200 with rows: cargo/abono as strings, fecha ISO, shape matches DTO
 *   - 200 for absent periodo → current UTC month (AC-12)
 *   - MOV-01: category field is the folded domain Bucket ('SinCategoria' /
 *     'Necesidades'), never the raw physical bucketId
 */
describe('MovimientosController (e2e) — GET /api/movimientos', () => {
  let app: Express;
  let prisma: PrismaClient;

  // Track seeded IDs for cleanup
  const seededIngestaIds: string[] = [];
  const seededAccountIds: string[] = [];
  // USER_ID_FIJO is the constant; we need a user record to satisfy FK
  const FIXED_USER_ID = 'usuario-fijo-moneydiary';

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    app = createApp(createContainer(prisma));
  });

  afterAll(async () => {
    // Clean up seeded test data in FK-inverse order
    if (seededIngestaIds.length > 0) {
      await prisma.transaccion.deleteMany({
        where: { ingestaId: { in: seededIngestaIds } },
      });
      await prisma.ingesta.deleteMany({
        where: { id: { in: seededIngestaIds } },
      });
    }
    if (seededAccountIds.length > 0) {
      await prisma.account.deleteMany({
        where: { id: { in: seededAccountIds } },
      });
    }
    await prisma.$disconnect();
  });

  // ── Validation errors ────────────────────────────────────────────────────

  it('AC-05: GET /api/movimientos?periodo=2026-13 → 400 (invalid month)', async () => {
    await request(app)
      .get('/api/movimientos?periodo=2026-13')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  it('AC-07a: GET /api/movimientos?periodo= (empty string) → 400', async () => {
    await request(app)
      .get('/api/movimientos?periodo=')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  it('AC-07b: GET /api/movimientos?periodo=abc → 400', async () => {
    await request(app)
      .get('/api/movimientos?periodo=abc')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  it('AC-07c: GET /api/movimientos?periodo=2026-7 (non-padded month) → 400', async () => {
    await request(app)
      .get('/api/movimientos?periodo=2026-7')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  it('AC-07d: GET /api/movimientos?periodo=2026/07 (wrong separator) → 400', async () => {
    await request(app)
      .get('/api/movimientos?periodo=2026%2F07')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  // ── Empty valid month ────────────────────────────────────────────────────

  it('AC-04: valid periodo with no data → 200 with empty envelope', async () => {
    // Use a month with no data: far past (2000-01)
    const response = await request(app)
      .get('/api/movimientos?periodo=2000-01')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(response.body.periodo).toBe('2000-01');
    expect(response.body.totalTransacciones).toBe(0);
    expect(response.body.transacciones).toEqual([]);
  });

  // ── Absent periodo defaults to current UTC month ──────────────────────────

  it('AC-12: GET /api/movimientos (no param) → 200, periodo equals current UTC month', async () => {
    // Compute the expected period from the test-side clock (same source as the server).
    // This is the correct approach for full-app e2e: freeze is not possible across
    // process boundaries, but computing expected on both sides is deterministic.
    const now = new Date();
    const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const response = await request(app)
      .get('/api/movimientos')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(response.body.periodo).toBe(expectedPeriodo);
    expect(typeof response.body.totalTransacciones).toBe('number');
    expect(Array.isArray(response.body.transacciones)).toBe(true);
  });

  // ── Happy path with seeded rows ──────────────────────────────────────────

  it('AC-08/AC-09/AC-11/MOV-01: seeded rows → 200, cargo/abono as strings, fecha ISO, bucket folded (SinCategoria + Necesidades), shape matches DTO', async () => {
    // Seed data under USER_ID_FIJO so the controller can find them
    // Use upsert for the account (idempotent) and create ingesta
    const account = await prisma.account.upsert({
      where: {
        userId_banco_tipoCuenta_numeroCuenta: {
          userId: FIXED_USER_ID,
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: `e2e-${RUN_ID}`,
        },
      },
      update: {},
      create: {
        userId: FIXED_USER_ID,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `e2e-${RUN_ID}`,
      },
    });
    seededAccountIds.push(account.id);

    const ingesta = await prisma.ingesta.create({
      data: {
        accountId: account.id,
        banco: 'BCI',
        nombreArchivo: `e2e-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    seededIngestaIds.push(ingesta.id);

    const bigAmount = 9007199254740993n; // > MAX_SAFE_INTEGER
    await prisma.transaccion.createMany({
      data: [
        {
          ingestaId: ingesta.id,
          accountId: account.id,
          fecha: new Date('2026-07-10T00:00:00.000Z'),
          descripcion: `Compra e2e ${RUN_ID}`,
          cargo: bigAmount,
          abono: 0n,
        },
        {
          ingestaId: ingesta.id,
          accountId: account.id,
          fecha: new Date('2026-07-15T00:00:00.000Z'),
          descripcion: `Abono e2e ${RUN_ID}`,
          cargo: 0n,
          abono: 150000n,
        },
        {
          ingestaId: ingesta.id,
          accountId: account.id,
          fecha: new Date('2026-07-18T00:00:00.000Z'),
          descripcion: `Categorizado e2e ${RUN_ID}`,
          cargo: 25000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      ],
    });

    const response = await request(app)
      .get('/api/movimientos?periodo=2026-07')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(response.body.periodo).toBe('2026-07');
    expect(response.body.totalTransacciones).toBe(response.body.transacciones.length);
    expect(response.body.totalTransacciones).toBeGreaterThan(0);

    // Find our seeded rows in the result
    const ourRows = (response.body.transacciones as Array<Record<string, unknown>>).filter(
      (tx) => typeof tx.descripcion === 'string' && (tx.descripcion as string).includes(RUN_ID),
    );
    expect(ourRows.length).toBe(3);

    for (const tx of ourRows) {
      // cargo and abono MUST be strings, never numbers (AC-08/AC-09)
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      // fecha MUST be an ISO string
      expect(typeof tx.fecha).toBe('string');
      expect(() => new Date(tx.fecha as string)).not.toThrow();
      // no raw bucketId leaks through the DTO (MOV-01)
      expect(tx.bucketId).toBeUndefined();
      // banco/tipoCuenta/numeroCuenta present
      expect(tx.banco).toBe('BCI');
      expect(tx.tipoCuenta).toBe('Cuenta Corriente');
    }

    // BigInt exactness: the > MAX_SAFE_INTEGER amount must survive as exact string
    const bigRow = ourRows.find((tx) => (tx.descripcion as string).includes('Compra'));
    expect(bigRow).toBeDefined();
    expect(bigRow!.cargo).toBe('9007199254740993');
    expect(bigRow!.abono).toBe('0');
    // Uncategorized row folds to SinCategoria (MOV-01)
    expect(bigRow!.bucket).toBe('SinCategoria');

    // Zero-cargo row
    const abonoRow = ourRows.find((tx) => (tx.descripcion as string).includes('Abono'));
    expect(abonoRow).toBeDefined();
    expect(abonoRow!.cargo).toBe('0');
    expect(abonoRow!.abono).toBe('150000');
    expect(abonoRow!.bucket).toBe('SinCategoria');

    // Categorized row folds to its domain Bucket, not the raw physical id (MOV-01)
    const categorizadoRow = ourRows.find((tx) => (tx.descripcion as string).includes('Categorizado'));
    expect(categorizadoRow).toBeDefined();
    expect(categorizadoRow!.bucket).toBe('Necesidades');
  });
});
