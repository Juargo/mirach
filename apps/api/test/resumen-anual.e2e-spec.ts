/**
 * E2E tests for GET /api/resumen/anual (US-030 Slice A).
 *
 * Requires a real DB (same dev DB as resumen e2e). Run via `pnpm api test:e2e`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds its own rows per RUN_ID and cleans up
 * in afterAll (transacciones + accounts; accounts cascade-delete ingestas too).
 *
 * Covered scenarios:
 *   - anio absent → defaults to current UTC year, HTTP 200
 *   - invalid anio → HTTP 400, scrubbed body (raw input not echoed)
 *   - DTO shape — 12 months, Jan→Dec periodo labels, reused ResumenMesDto shape
 *   - CA-08 (MANDATORY, RNF-SEC-006): user isolation — authenticates AS user A
 *     and asserts user A's annual resumen excludes user B's data
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv, type Env } from '../src/config/env';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `resumen-anual-e2e-${Date.now()}`;
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();

describe('ResumenController (e2e) — GET /api/resumen/anual', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;
  let env: Env;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    env = loadEnv();
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
    // CA-08 logs in as a seeded user (userA), which creates a real Session
    // row — must be deleted before the user (FK is Restrict, not Cascade).
    await prisma.session.deleteMany({
      where: { userId: { startsWith: RUN_ID } },
    });
    await prisma.user.deleteMany({
      where: { id: { startsWith: RUN_ID } },
    });
    await prisma.$disconnect();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function seedUser(suffix: string): Promise<string> {
    const userId = `${RUN_ID}-${suffix}`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: `E2E User ${suffix}` },
    });
    return userId;
  }

  /**
   * Same as seedUser, but also gives the user real login credentials
   * (email + argon2id passwordHash) so CA-08 can authenticate AS this user
   * instead of piggybacking on the shared USER_ID_FIJO session — mirrors
   * the seeding pattern in auth-login.e2e-spec.ts.
   */
  async function seedUserWithCredentials(
    suffix: string,
    password: string,
  ): Promise<{ userId: string; email: string }> {
    const userId = `${RUN_ID}-${suffix}`;
    const email = `${userId}@example.com`;
    const passwordHash = await new Argon2PasswordHasher().hash(password);
    // US-035: email cifrado + blind index (ver auth-login.e2e-spec.ts) —
    // CA-08 hace login REAL como este usuario, así que buscarPorEmail debe
    // encontrarlo por emailBlindIndex.
    const encryptedFields = buildEncryptedEmailFields(email, env);
    await prisma.user.upsert({
      where: { id: userId },
      update: { ...encryptedFields, passwordHash },
      create: {
        id: userId,
        nombre: `E2E User ${suffix}`,
        ...encryptedFields,
        passwordHash,
      },
    });
    return { userId, email };
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
        descripcion: 'E2E Test tx',
      },
    });
  }

  // ── invalid anio → 400 ──────────────────────────────────────────────────────

  it('anio=not-a-year → 400, scrubbed body', async () => {
    const res = await request(app)
      .get('/api/resumen/anual?anio=not-a-year')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('not-a-year');
  });

  it('anio=1999 (out of range) → 400', async () => {
    await request(app)
      .get('/api/resumen/anual?anio=1999')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);
  });

  // ── anio absent → current year default ─────────────────────────────────────

  it('GET /api/resumen/anual (no anio) → 200 with current UTC year', async () => {
    const res = await request(app)
      .get('/api/resumen/anual')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.anio).toBe(CURRENT_YEAR);
  });

  // ── DTO shape ────────────────────────────────────────────────────────────

  it('DTO shape — 12 months, Jan→Dec periodo labels, reused ResumenMesDto shape', async () => {
    // US-045/D-07: seed an uncategorized cargo row for USER_ID_FIJO (the
    // account `sesion` authenticates as) in a known month (May) FIRST — the
    // shared loginAsSeededUser fixture is NOT guaranteed to contain one for
    // the current UTC year, so a zero-default assertion would not catch a
    // placeholder-0 regression in the annual reduce.
    if (ALLOW) {
      const mayoFecha = new Date(Date.UTC(CURRENT_YEAR, 4, 10)); // May
      const accountFijo = await seedAccount(USER_ID_FIJO, 'anual-dto-shape');
      const ingestaFijo = await seedIngesta(
        accountFijo,
        'anual-dto-shape',
        USER_ID_FIJO,
      );
      await seedTx({
        accountId: accountFijo,
        ingestaId: ingestaFijo,
        bucketId: null, // uncategorized — cargo counted, D-07
        cargo: 12_000n,
        abono: 0n,
        fecha: mayoFecha,
      });
    }

    const res = await request(app)
      .get(`/api/resumen/anual?anio=${CURRENT_YEAR}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.anio).toBe(CURRENT_YEAR);
    expect(Array.isArray(res.body.meses)).toBe(true);
    expect(res.body.meses).toHaveLength(12);
    expect(res.body.meses[0].periodo).toBe(`${CURRENT_YEAR}-01`);
    expect(res.body.meses[11].periodo).toBe(`${CURRENT_YEAR}-12`);

    for (const mes of res.body.meses) {
      expect(typeof mes.totalIngreso).toBe('string');
      expect(typeof mes.sinIngreso).toBe('boolean');
      expect(mes.buckets).toHaveLength(4);
      expect(typeof mes.cantidadSinCategoria).toBe('number');
    }

    if (ALLOW) {
      // Index 4 = May — proves the annual reduce carries the REAL count
      // through per-month, not a placeholder 0 (D-07).
      expect(res.body.meses[4].cantidadSinCategoria).toBeGreaterThan(0);
    }
  });

  // ── CA-08: user isolation (MANDATORY RNF-SEC-006) ──────────────────────────

  it('CA-08: user A does NOT see user B annual data', async () => {
    if (!ALLOW) return; // Skip if no real DB

    const PASSWORD_A = 'ca08-userA-password-123';
    const { email: emailA } = await seedUserWithCredentials(
      'ca08-a',
      PASSWORD_A,
    );
    const userA = `${RUN_ID}-ca08-a`;
    const accountA = await seedAccount(userA, 'ca08-a');
    const ingestaA = await seedIngesta(accountA, 'ca08-a', userA);

    const userB = await seedUser('ca08-b');
    const accountB = await seedAccount(userB, 'ca08-b');
    const ingestaB = await seedIngesta(accountB, 'ca08-b', userB);

    const fecha = new Date(Date.UTC(CURRENT_YEAR, 2, 10)); // March

    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
      fecha,
    });
    await seedTx({
      accountId: accountB,
      ingestaId: ingestaB,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 9_000_000n,
      fecha,
    });

    // US-045/CA-08: 1 uncategorized cargo row for A, distinct from B's 3 —
    // proves cantidadSinCategoria is isolated by userId at the annual
    // endpoint boundary, not just totalIngreso/bucket totals.
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: null,
      cargo: 5_000n,
      abono: 0n,
      fecha,
    });
    for (let i = 0; i < 3; i++) {
      await seedTx({
        accountId: accountB,
        ingestaId: ingestaB,
        bucketId: null,
        cargo: BigInt(6_000 + i),
        abono: 0n,
        fecha,
      });
    }

    // Authenticate AS user A (not the shared USER_ID_FIJO session) so this
    // is a real cross-user isolation check: user A's own session must never
    // see user B's data, even though both have March income rows.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: emailA, password: PASSWORD_A })
      .expect(200);
    const setCookie = loginRes.headers['set-cookie'] as unknown as string[];
    const cookieA = setCookie[0].split(';')[0]; // "md_session=<token>"

    const res = await request(app)
      .get(`/api/resumen/anual?anio=${CURRENT_YEAR}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    const marzo = res.body.meses[2];
    // User A's March total must be exactly user A's own income (1M) — if
    // isolation were broken, user B's 9M would leak in, either replacing or
    // summing with A's total, so an exact match rules out both failure modes.
    expect(BigInt(marzo.totalIngreso)).toBe(1_000_000n);
    // US-045/CA-08: A's cantidadSinCategoria reflects only A's 1 uncategorized
    // cargo row — never B's 3 (isolation at the annual endpoint boundary).
    expect(marzo.cantidadSinCategoria).toBe(1);
  });
});
