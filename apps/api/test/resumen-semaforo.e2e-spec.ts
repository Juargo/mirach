/**
 * E2E tests for GET /api/resumen/semaforo (US-049).
 *
 * Requires a real DB (same dev DB as `resumen.e2e-spec.ts`). Run via
 * `pnpm api test:e2e` (sets ALLOW_DESTRUCTIVE_DB=1). Seeds its own rows per
 * RUN_ID and cleans up in afterAll (transacciones + accounts; accounts
 * cascade-delete ingestas too), same helper shape as `resumen.e2e-spec.ts`.
 *
 * Covered scenarios (design §3 ledger):
 *   - absent periodo → 200 with current UTC period
 *   - malformed periodo → 400, scrubbed body (raw input not echoed)
 *   - DTO shape — 3 buckets, `bandas` present, non-empty `diagnostico`
 *   - empty month → sinIngreso=true, all consejo null, diagnostico = D1
 *   - two-user isolation (ISO-01/ISO-02, MANDATORY RNF-SEC-006) — cookie AND
 *     Bearer transport, per `resumen.e2e-spec.ts`'s SC-09 precedent
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `resumen-semaforo-e2e-${Date.now()}`;
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;
const MID_MONTH_DATE = new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), 10));

describe('ResumenSemaforo (e2e) — GET /api/resumen/semaforo', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
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
    await prisma.$disconnect();
  });

  // ── Helpers (mirrors resumen.e2e-spec.ts) ──────────────────────────────

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

  async function seedIngesta(
    accountId: string,
    suffix: string,
    userId: string,
  ): Promise<string> {
    const ingestaId = `${RUN_ID}-ing-${suffix}`;
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

  // ── malformed periodo → 400, scrubbed ───────────────────────────────────

  it('?periodo=not-a-date → 400, scrubbed body', async () => {
    const res = await request(app)
      .get('/api/resumen/semaforo?periodo=not-a-date')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
  });

  // ── absent periodo → current UTC month ─────────────────────────────────

  it('sin periodo → 200 con el periodo UTC actual', async () => {
    const res = await request(app)
      .get('/api/resumen/semaforo')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.periodo).toBe(CURRENT_PERIODO);
  });

  // ── DTO shape ───────────────────────────────────────────────────────────

  it('DTO shape — 3 buckets, bandas presentes, diagnostico no vacío', async () => {
    const res = await request(app)
      .get(`/api/resumen/semaforo?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.buckets).toHaveLength(3);
    const bucketNames = res.body.buckets.map(
      (b: { bucket: string }) => b.bucket,
    );
    expect(bucketNames).toEqual([
      Bucket.Necesidades,
      Bucket.Deseos,
      Bucket.Ahorro,
    ]);
    for (const bucket of res.body.buckets) {
      expect(bucket.bandas).toBeDefined();
      expect(typeof bucket.bandas.verdeMax).toBe('number');
      expect(typeof bucket.metaBp).toBe('number');
      expect(typeof bucket.total).toBe('string');
    }
    expect(typeof res.body.diagnostico).toBe('string');
    expect(res.body.diagnostico.length).toBeGreaterThan(0);
    expect(res.body.sinCategoria).toBeDefined();
    expect(typeof res.body.sinCategoria.cantidad).toBe('number');
    expect(typeof res.body.sinCategoria.total).toBe('string');
  });

  // ── empty month → sinIngreso shape ─────────────────────────────────────

  it('mes vacío → sinIngreso=true, todos los consejo null, diagnostico = D1', async () => {
    const res = await request(app)
      .get('/api/resumen/semaforo?periodo=2099-12')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.sinIngreso).toBe(true);
    expect(res.body.totalIngreso).toBe('0');
    expect(res.body.estadoGlobal).toBeNull();
    expect(res.body.bucketsCriticos).toEqual([]);
    expect(res.body.diagnostico).toBe(
      'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.',
    );
    for (const bucket of res.body.buckets) {
      expect(bucket.porcentajeBp).toBeNull();
      expect(bucket.estadoSemaforo).toBeNull();
      expect(bucket.consejo).toBeNull();
    }
  });

  // ── two-user isolation (ISO-01/ISO-02, MANDATORY RNF-SEC-006) ───────────

  it('aislamiento de dos usuarios (cookie transport): los datos del otro usuario no aparecen', async () => {
    if (!ALLOW) return; // Skip if no real DB

    const alienUserId = await seedUser('iso-alien');
    const alienAccountId = await seedAccount(alienUserId, 'iso-alien');
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-alien',
      alienUserId,
    );

    // Alien user's transactions — pushes Necesidades to Rojo, must NOT leak.
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 900_000n,
      abono: 0n,
    });

    const res = await request(app)
      .get(`/api/resumen/semaforo?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    // The seeded user (USER_ID_FIJO) must never reflect the alien's amounts
    // or their driven-Rojo diagnosis.
    expect(BigInt(res.body.totalIngreso)).toBeLessThan(1_000_000n);
    const necesidades = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Necesidades,
    );
    expect(BigInt(necesidades.total)).toBeLessThan(900_000n);
    expect(JSON.stringify(res.body)).not.toContain(alienUserId);
  });

  it('aislamiento de dos usuarios (Bearer transport): mismo resultado que cookie (T5.14)', async () => {
    if (!ALLOW) return; // Skip if no real DB

    const alienUserId = await seedUser('iso-alien-bearer');
    const alienAccountId = await seedAccount(alienUserId, 'iso-alien-bearer');
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-alien-bearer',
      alienUserId,
    );

    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 2_000_000n,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ahorro],
      cargo: 1_800_000n,
      abono: 0n,
    });

    const res = await request(app)
      .get(`/api/resumen/semaforo?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${sesion.token}`)
      .expect(200);

    expect(BigInt(res.body.totalIngreso)).toBeLessThan(2_000_000n);
    const ahorro = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Ahorro,
    );
    expect(BigInt(ahorro.total)).toBeLessThan(1_800_000n);
    expect(JSON.stringify(res.body)).not.toContain(alienUserId);
  });
});
