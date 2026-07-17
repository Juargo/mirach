/**
 * E2E tests for GET /api/buckets/:bucket (US-017).
 *
 * Requires a real DB (same dev DB as resumen e2e). Run via `pnpm api test:e2e`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds its own rows per RUN_ID and cleans up
 * in afterAll (transacciones + accounts; accounts cascade-delete ingestas too).
 *
 * Covered scenarios (spec BDD):
 *   - W3-01: valid bucket + valid periodo → 200, flat list, BigInt-safe strings
 *   - W3-02a: invalid :bucket → 400, scrubbed (raw value not echoed)
 *   - W3-02b: invalid periodo → 400, scrubbed (raw value not echoed)
 *   - periodo absent → defaults to current UTC month, HTTP 200
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';

const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `detbucket-e2e-${Date.now()}`;
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;
const MID_MONTH_DATE = new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), 10));

describe('DetalleBucketController (e2e) — GET /api/buckets/:bucket', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaService;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    if (createdAccountIds.length > 0) {
      await prisma.transaccion.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.ingesta.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
    await prisma.user.deleteMany({
      where: { id: { startsWith: RUN_ID } },
    });
    await app.close();
  });

  async function seedUser(suffix: string): Promise<string> {
    const userId = `${RUN_ID}-${suffix}`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: `E2E User ${suffix}` },
    });
    return userId;
  }

  async function seedAccount(userId: string, suffix: string): Promise<string> {
    const accountId = `${RUN_ID}-acc-${suffix}`;
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
    const ingestaId = `${RUN_ID}-ing-${suffix}`;
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

  async function seedTx(opts: {
    accountId: string;
    ingestaId: string;
    bucketId: string | null;
    cargo: bigint;
    abono: bigint;
  }): Promise<void> {
    await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: opts.bucketId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: MID_MONTH_DATE,
        descripcion: 'E2E Test tx',
      },
    });
  }

  // ── W3-02a: invalid :bucket → scrubbed 400 ─────────────────────────────────

  it('W3-02a: GET /api/buckets/invalido → 400, raw value not echoed', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/buckets/invalido?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('invalido');
  });

  // ── W3-02b: invalid periodo → scrubbed 400 ─────────────────────────────────

  it('W3-02b: GET /api/buckets/Necesidades?periodo=not-a-date → 400, raw value not echoed', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/buckets/Necesidades?periodo=not-a-date')
      .set('x-api-key', API_KEY)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
  });

  it('W3-02b: GET /api/buckets/Necesidades?periodo=2026-13 → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/buckets/Necesidades?periodo=2026-13')
      .set('x-api-key', API_KEY)
      .expect(400);
  });

  // ── periodo absent → current month default ─────────────────────────────────

  it('GET /api/buckets/Necesidades (no periodo) → 200 with current UTC periodo', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/buckets/Necesidades')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(res.body.periodo).toBe(CURRENT_PERIODO);
    expect(res.body.bucket).toBe(Bucket.Necesidades);
  });

  // ── W3-01: DTO shape — flat list, BigInt-safe strings ──────────────────────

  it('W3-01: valid bucket + valid periodo → 200, flat list with string amounts', async () => {
    const userId = await seedUser('w301');
    const accountId = await seedAccount(userId, 'w301');
    const ingestaId = await seedIngesta(accountId, 'w301');

    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 75_000n,
      abono: 0n,
    });

    // The endpoint uses USER_ID_FIJO, not our seeded userId — this verifies
    // response SHAPE (mirrors resumen.e2e-spec.ts's SC-01 approach).
    const res = await request(app.getHttpServer())
      .get(`/api/buckets/Necesidades?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(res.body.bucket).toBe(Bucket.Necesidades);
    expect(typeof res.body.periodo).toBe('string');
    expect(Array.isArray(res.body.transacciones)).toBe(true);
    for (const tx of res.body.transacciones) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      expect(typeof tx.fecha).toBe('string');
      expect(typeof tx.banco).toBe('string');
      expect(typeof tx.tipoCuenta).toBe('string');
      expect(typeof tx.numeroCuenta).toBe('string');
    }
  });

  it('empty bucket/period combination → 200 with empty transacciones (not an error)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/buckets/Ahorro?periodo=2099-12')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(res.body.transacciones).toEqual([]);
  });
});
