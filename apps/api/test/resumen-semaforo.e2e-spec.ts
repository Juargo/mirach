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
 *     Bearer transport, upgraded to the CA-08 pattern from
 *     `resumen-anual.e2e-spec.ts` (the house's stronger idiom): each variant
 *     authenticates AS a fresh, credentialed user with a fully KNOWN state
 *     and asserts EXACT matches on diagnostico/bucketsCriticos/consejo/
 *     sinCategoria — not just totalIngreso/bucket-total inequalities
 *     (judgment-day round 1 finding, see tasks.md T8.2 correction note)
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
    // CA-08 (upgraded ISO-01/ISO-02) logs in as fresh credentialed users,
    // which creates real Session rows — must be deleted before the user
    // (FK is Restrict, not Cascade), same precedent as resumen-anual.e2e-spec.ts.
    await prisma.session.deleteMany({
      where: { userId: { startsWith: RUN_ID } },
    });
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

  /**
   * Same as seedUser, but also gives the user real login credentials (email +
   * argon2id passwordHash) so the CA-08 isolation tests can authenticate AS
   * this user instead of piggybacking on the shared USER_ID_FIJO session —
   * mirrors the seeding pattern in `resumen-anual.e2e-spec.ts`.
   */
  async function seedUserWithCredentials(
    suffix: string,
    password: string,
  ): Promise<{ userId: string; email: string }> {
    const userId = `${RUN_ID}-${suffix}`;
    const email = `${userId}@example.com`;
    const passwordHash = await new Argon2PasswordHasher().hash(password);
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
  //
  // CA-08 pattern (upgraded from a near-tautological `not.toContain` check,
  // per `resumen-anual.e2e-spec.ts`'s stronger precedent): each variant
  // authenticates AS a fresh, credentialed user with a FULLY KNOWN state and
  // asserts EXACT matches on the new US-049 fields — diagnostico,
  // bucketsCriticos, per-bucket consejo (monto/mensaje), and sinCategoria —
  // not just totalIngreso/bucket-total inequalities. The alien user gets a
  // DIFFERENT known state (different driving bucket, different uncategorized
  // rows) so an exact match on the authenticated user's numbers is only
  // possible if isolation actually held.

  it('aislamiento de dos usuarios (cookie transport, CA-08): diagnostico/bucketsCriticos/consejo/sinCategoria son exactamente los de A, nunca los de B', async () => {
    if (!ALLOW) return; // Skip if no real DB

    const PASSWORD_A = 'iso-cookie-userA-password-123';
    const { email: emailA } = await seedUserWithCredentials(
      'iso-cookie-a',
      PASSWORD_A,
    );
    const userA = `${RUN_ID}-iso-cookie-a`;
    const accountA = await seedAccount(userA, 'iso-cookie-a');
    const ingestaA = await seedIngesta(accountA, 'iso-cookie-a', userA);

    const alienUserId = await seedUser('iso-cookie-alien');
    const alienAccountId = await seedAccount(alienUserId, 'iso-cookie-alien');
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-cookie-alien',
      alienUserId,
    );

    // User A — fully known state: income 1_000_000, Deseos overspent to a
    // known Rojo (bp=5000, driving), Necesidades/Ahorro kept Verde, 2
    // uncategorized cargo rows.
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 1_000_000n,
    });
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 400_000n, // bp=4000 → Verde (verdeMax=5000)
      abono: 0n,
    });
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 500_000n, // bp=5000 → Rojo (amarilloMax=4000) — the driving bucket
      abono: 0n,
    });
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: BUCKET_IDS[Bucket.Ahorro],
      cargo: 300_000n, // bp=3000 → Verde (band [2000,4000])
      abono: 0n,
    });
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: null, // uncategorized
      cargo: 7_000n,
      abono: 0n,
    });
    await seedTx({
      accountId: accountA,
      ingestaId: ingestaA,
      bucketId: null, // uncategorized
      cargo: 3_000n,
      abono: 0n,
    });

    // Alien — DIFFERENT known state: bigger income, Necesidades (not Deseos)
    // driven to Rojo, and a different uncategorized count/total.
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 5_000_000n,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 4_000_000n, // bp=8000 → Rojo — must NOT leak into A's response
      abono: 0n,
    });
    for (let i = 0; i < 4; i++) {
      await seedTx({
        accountId: alienAccountId,
        ingestaId: alienIngestaId,
        bucketId: null,
        cargo: BigInt(1_000 + i),
        abono: 0n,
      });
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: emailA, password: PASSWORD_A })
      .expect(200);
    const setCookie = loginRes.headers['set-cookie'] as unknown as string[];
    const cookieA = setCookie[0].split(';')[0]; // "md_session=<token>"

    const res = await request(app)
      .get(`/api/resumen/semaforo?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    // Exact match on A's own numbers rules out both failure modes (leak-in
    // and leak-replace), the same reasoning as CA-08 in resumen-anual.
    expect(res.body.totalIngreso).toBe('1000000');
    expect(res.body.estadoGlobal).toBe('rojo');
    // Driven ONLY by Deseos (A's Necesidades/Ahorro are Verde) — never
    // mentions Necesidades, which is the alien's driving bucket.
    expect(res.body.diagnostico).toBe('Tu mes está en rojo por Gustos.');
    expect(res.body.bucketsCriticos).toEqual([Bucket.Deseos]);

    const necesidades = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Necesidades,
    );
    expect(necesidades.total).toBe('400000');
    expect(necesidades.estadoSemaforo).toBe('verde');
    expect(necesidades.consejo).toBeNull();

    const deseos = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Deseos,
    );
    expect(deseos.total).toBe('500000');
    expect(deseos.estadoSemaforo).toBe('rojo');
    // A's exact CLP-to-Verde advice — computable from the known seed
    // (montoMaximoConBpHasta(1_000_000n, 3000n) = 300_049n; 500_000 - 300_049).
    expect(deseos.consejo).toEqual({
      direccion: 'reducir',
      monto: '199951',
      mensaje: 'Para volver a Verde, reduce {monto} en Gustos este mes.',
    });

    const ahorro = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Ahorro,
    );
    expect(ahorro.total).toBe('300000');
    expect(ahorro.estadoSemaforo).toBe('verde');
    expect(ahorro.consejo).toBeNull();

    // A's exact uncategorized count/total — never B's (4 rows, ~4006 total).
    expect(res.body.sinCategoria).toEqual({ cantidad: 2, total: '10000' });

    // Coarse secondary net: the alien's id must never appear on the wire.
    expect(JSON.stringify(res.body)).not.toContain(alienUserId);
  });

  it('aislamiento de dos usuarios (Bearer transport, CA-08): mismos campos nuevos aislados, con un caso distinto (ahorro-alto)', async () => {
    if (!ALLOW) return; // Skip if no real DB

    const PASSWORD_C = 'iso-bearer-userC-password-123';
    const { email: emailC } = await seedUserWithCredentials(
      'iso-bearer-c',
      PASSWORD_C,
    );
    const userC = `${RUN_ID}-iso-bearer-c`;
    const accountC = await seedAccount(userC, 'iso-bearer-c');
    const ingestaC = await seedIngesta(accountC, 'iso-bearer-c', userC);

    const alienUserId = await seedUser('iso-bearer-alien');
    const alienAccountId = await seedAccount(alienUserId, 'iso-bearer-alien');
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-bearer-alien',
      alienUserId,
    );

    // User C — a DIFFERENT known state than A above: income 2_000_000,
    // Necesidades/Deseos Verde, Ahorro driven to Rojo via the "ahorro-alto"
    // case (saving over the band), 3 uncategorized cargo rows.
    await seedTx({
      accountId: accountC,
      ingestaId: ingestaC,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 2_000_000n,
    });
    await seedTx({
      accountId: accountC,
      ingestaId: ingestaC,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 600_000n, // bp=3000 → Verde
      abono: 0n,
    });
    await seedTx({
      accountId: accountC,
      ingestaId: ingestaC,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 400_000n, // bp=2000 → Verde
      abono: 0n,
    });
    await seedTx({
      accountId: accountC,
      ingestaId: ingestaC,
      bucketId: BUCKET_IDS[Bucket.Ahorro],
      cargo: 1_200_000n, // bp=6000 → Rojo (amarilloMax=5000), ahorro-alto — driving
      abono: 0n,
    });
    for (let i = 0; i < 3; i++) {
      await seedTx({
        accountId: accountC,
        ingestaId: ingestaC,
        bucketId: null,
        cargo: BigInt(5_000 + i),
        abono: 0n,
      });
    }

    // Alien — different income, different driving bucket, different
    // uncategorized count — must NOT leak into C's response.
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      cargo: 0n,
      abono: 8_000_000n,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 4_000_000n, // bp=5000 → Rojo — the alien's own driving bucket
      abono: 0n,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: null,
      cargo: 9_000n,
      abono: 0n,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: emailC, password: PASSWORD_C })
      .expect(200);
    const tokenC = loginRes.body.token as string;

    const res = await request(app)
      .get(`/api/resumen/semaforo?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    // Same rigor as the cookie variant (US-045 lesson: both transports
    // assert the new fields) — a different bucket/case (Ahorro, ahorro-alto)
    // exercises the OTHER consejo branch than the cookie test's Deseos case.
    expect(res.body.totalIngreso).toBe('2000000');
    expect(res.body.estadoGlobal).toBe('rojo');
    expect(res.body.diagnostico).toBe('Tu mes está en rojo por Ahorro.');
    expect(res.body.bucketsCriticos).toEqual([Bucket.Ahorro]);

    const ahorro = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Ahorro,
    );
    expect(ahorro.total).toBe('1200000');
    expect(ahorro.estadoSemaforo).toBe('rojo');
    // C's exact CLP-to-Verde advice — computable from the known seed
    // (montoMinimoConBpDesde(2_000_000n, 2000n) = 399_900n; 1_200_000 - 399_900).
    expect(ahorro.consejo).toEqual({
      direccion: 'reducir',
      monto: '800100',
      mensaje:
        'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.',
    });

    const necesidades = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Necesidades,
    );
    expect(necesidades.consejo).toBeNull();
    const deseos = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Deseos,
    );
    expect(deseos.consejo).toBeNull();

    // C's exact uncategorized count/total — never the alien's (1 row, 9000).
    expect(res.body.sinCategoria).toEqual({ cantidad: 3, total: '15003' });

    expect(JSON.stringify(res.body)).not.toContain(alienUserId);
  });
});
