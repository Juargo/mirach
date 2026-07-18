/**
 * Cross-user isolation integration test (ISO-01, ISO-02 — Slice 2).
 *
 * Proves the Slice 2 rewire actually delivers per-user isolation on the 4
 * data endpoints now that `userId` comes from `@CurrentUser()` instead of
 * `USER_ID_FIJO_TOKEN`: user A's session must NEVER surface user B's data,
 * and a request with a valid `x-api-key` but NO session must 401 (no
 * keyless/default-userId fallback remains — the guard is genuinely
 * mandatory, not just decorative).
 *
 * Requires a real DB. Run via `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`
 * (picked up by `vitest.int.config.ts`'s `test/**\/*.int-spec.ts` glob, same
 * setup/gate as the e2e suites per `test/integration.setup.ts`).
 *
 * DEFERRED (apply batch note, mirrors Slice 1's auth-login.e2e-spec.ts):
 * written per design.md §8 but NOT executed against the real DB this batch —
 * the `add_auth_login_session` migration + Slice 1's e2e/rate-limit suites
 * are still pending the explicit user approval to apply. Every assertion is
 * gated on `ALLOW_DESTRUCTIVE_DB=1` so the file still typechecks and is a
 * no-op inside `pnpm api test` (unit config does not include
 * `test/**\/*.int-spec.ts` either).
 *
 * Covered scenarios (design.md §8):
 *   - GET /api/resumen via A's cookie → only A's totals (ISO-02)
 *   - GET /api/resumen via A's Authorization: Bearer → identical result
 *     (ISO-02 mobile scenario, same transport parity as auth-login.e2e-spec.ts)
 *   - GET /api/resumen with valid x-api-key but NO session → 401
 *     (ISO-01 — no keyless fallback)
 *   - GET /api/movimientos via A's cookie → only A's rows, B's never appear
 *   - GET /api/buckets/:bucket via A's cookie → only A's rows, B's never appear
 *   - POST /api/ingestas via A's cookie → the created Account is scoped to
 *     A's userId (never a fixed/default user)
 *   - POST /api/ingestas with valid x-api-key but NO session → 401
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const PASSWORD = 'correcto-123-clave-iso';

const RUN_ID = `auth-isolation-int-${Date.now()}`;
const EMAIL_A = `${RUN_ID}-a@example.com`;
const EMAIL_B = `${RUN_ID}-b@example.com`;

const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;
const MID_MONTH_DATE = new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), 10));

describe('Cross-user isolation (integration) — auth-rewired data endpoints (ISO-01, ISO-02)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaService;

  let userIdA: string;
  let userIdB: string;
  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;
  let cookieA: string;
  let tokenA: string;
  let ingestedAccountIdForA: string | undefined;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos-test.xlsx');

  beforeAll(async () => {
    if (!ALLOW) return;

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const userA = await prisma.user.create({
      data: { nombre: `Isolation A ${RUN_ID}`, email: EMAIL_A, passwordHash },
    });
    const userB = await prisma.user.create({
      data: { nombre: `Isolation B ${RUN_ID}`, email: EMAIL_B, passwordHash },
    });
    userIdA = userA.id;
    userIdB = userB.id;

    accountIdA = (
      await prisma.account.create({
        data: {
          userId: userIdA,
          banco: 'TestBank',
          tipoCuenta: 'CuentaCorriente',
          numeroCuenta: `iso-a-${RUN_ID}`,
        },
      })
    ).id;
    accountIdB = (
      await prisma.account.create({
        data: {
          userId: userIdB,
          banco: 'TestBank',
          tipoCuenta: 'CuentaCorriente',
          numeroCuenta: `iso-b-${RUN_ID}`,
        },
      })
    ).id;

    ingestaIdA = (
      await prisma.ingesta.create({
        data: {
          accountId: accountIdA,
          banco: 'TestBank',
          nombreArchivo: `a-${RUN_ID}.xlsx`,
          estado: 'PROCESADA',
        },
      })
    ).id;
    ingestaIdB = (
      await prisma.ingesta.create({
        data: {
          accountId: accountIdB,
          banco: 'TestBank',
          nombreArchivo: `b-${RUN_ID}.xlsx`,
          estado: 'PROCESADA',
        },
      })
    ).id;

    // A's data — modest amounts.
    await prisma.transaccion.createMany({
      data: [
        {
          accountId: accountIdA,
          ingestaId: ingestaIdA,
          bucketId: BUCKET_IDS[Bucket.Ingreso],
          cargo: 0n,
          abono: 1_000_000n,
          fecha: MID_MONTH_DATE,
          descripcion: `Ingreso A ${RUN_ID}`,
        },
        {
          accountId: accountIdA,
          ingestaId: ingestaIdA,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
          cargo: 200_000n,
          abono: 0n,
          fecha: MID_MONTH_DATE,
          descripcion: `Necesidad A ${RUN_ID}`,
        },
      ],
    });

    // B's data — large amounts, must NEVER leak into A's results.
    await prisma.transaccion.createMany({
      data: [
        {
          accountId: accountIdB,
          ingestaId: ingestaIdB,
          bucketId: BUCKET_IDS[Bucket.Ingreso],
          cargo: 0n,
          abono: 9_000_000n,
          fecha: MID_MONTH_DATE,
          descripcion: `Ingreso B ${RUN_ID}`,
        },
        {
          accountId: accountIdB,
          ingestaId: ingestaIdB,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
          cargo: 4_000_000n,
          abono: 0n,
          fecha: MID_MONTH_DATE,
          descripcion: `Necesidad B ${RUN_ID}`,
        },
      ],
    });

    // Log in as A ONCE — the same login response gives us both transports:
    // the Set-Cookie header AND the body token for Authorization: Bearer.
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL_A, password: PASSWORD })
      .expect(200);
    const rawCookie = (loginRes.headers['set-cookie'] as unknown as string[])[0]!;
    cookieA = rawCookie.split(';')[0]!;
    tokenA = loginRes.body.token;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: [ingestaIdA, ingestaIdB] } },
    });
    if (ingestedAccountIdForA) {
      await prisma.transaccion.deleteMany({
        where: { accountId: ingestedAccountIdForA },
      });
      await prisma.ingesta.deleteMany({
        where: { accountId: ingestedAccountIdForA },
      });
      await prisma.account.deleteMany({ where: { id: ingestedAccountIdForA } });
    }
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA, accountIdB] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userIdA, userIdB] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userIdA, userIdB] } },
    });
    await app.close();
  });

  it("GET /api/resumen (cookie): returns only A's totals, never B's (ISO-02)", async () => {
    if (!ALLOW) return;

    const res = await request(app.getHttpServer())
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    expect(res.body.totalIngreso).toBe('1000000');
    const necesidades = res.body.buckets.find(
      (b: { bucket: string }) => b.bucket === Bucket.Necesidades,
    );
    expect(necesidades.total).toBe('200000');
  });

  it("GET /api/resumen (Authorization: Bearer): identical result to the cookie transport (ISO-02 mobile scenario)", async () => {
    if (!ALLOW) return;

    const res = await request(app.getHttpServer())
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.totalIngreso).toBe('1000000');
  });

  it('GET /api/resumen: valid x-api-key but NO session (neither cookie nor Bearer) → 401 — no keyless fallback (ISO-01)', async () => {
    if (!ALLOW) return;

    await request(app.getHttpServer())
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .expect(401);
  });

  it("GET /api/movimientos (cookie): returns only A's transactions, B's rows never appear (ISO-02)", async () => {
    if (!ALLOW) return;

    const res = await request(app.getHttpServer())
      .get(`/api/movimientos?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    const descripciones = (
      res.body.transacciones as Array<{ descripcion: string }>
    ).map((t) => t.descripcion);
    expect(descripciones.some((d) => d.includes(`A ${RUN_ID}`))).toBe(true);
    expect(descripciones.some((d) => d.includes(`B ${RUN_ID}`))).toBe(false);
  });

  it("GET /api/buckets/Necesidades (cookie): returns only A's bucket detail, B's rows never appear (ISO-02)", async () => {
    if (!ALLOW) return;

    const res = await request(app.getHttpServer())
      .get(`/api/buckets/Necesidades?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    const descripciones = (
      res.body.transacciones as Array<{ descripcion: string }>
    ).map((t) => t.descripcion);
    expect(descripciones.some((d) => d.includes(`A ${RUN_ID}`))).toBe(true);
    expect(descripciones.some((d) => d.includes(`B ${RUN_ID}`))).toBe(false);
  });

  it("POST /api/ingestas (cookie): the created Account is scoped to A's userId, never a fixed/default user (ISO-01/02)", async () => {
    if (!ALLOW) return;

    const res = await request(app.getHttpServer())
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .attach('file', xlsxFixture, `iso-${RUN_ID}.xlsx`)
      .expect(200);

    const cuenta = await prisma.account.findFirst({
      where: {
        banco: res.body.banco,
        tipoCuenta: res.body.tipoCuenta,
        numeroCuenta: res.body.numeroCuenta,
        userId: userIdA,
      },
    });
    expect(cuenta).not.toBeNull();
    expect(cuenta?.userId).toBe(userIdA);
    ingestedAccountIdForA = cuenta!.id;
  });

  it('POST /api/ingestas: valid x-api-key but NO session → 401, upload never processed (ISO-01)', async () => {
    if (!ALLOW) return;

    await request(app.getHttpServer())
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .attach('file', xlsxFixture, `iso-noauth-${RUN_ID}.xlsx`)
      .expect(401);
  });
});
