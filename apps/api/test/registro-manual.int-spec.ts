/**
 * registro-manual.int-spec.ts — US-058 Phase 4 (T-23).
 *
 * Integration tests for POST /api/movimientos (manual movement registration).
 * Tests run against a real local ephemeral Postgres (ALLOW_DESTRUCTIVE_DB=1,
 * .env.test, localhost — gate blocks prod/Supabase connection strings).
 *
 * Spec coverage:
 *   - MAN-01 / MAN-03: domain validation end-to-end (future fecha, zero monto,
 *     float monto, empty descripcion, missing bucket on Gasto) → 400 scrubbed
 *   - MAN-02: Ingreso auto-classification (no catalog call, stray bucket → 400)
 *   - MAN-03: Gasto cascade (valid, categoriaId outside catalog, wrong bucket,
 *     cross-tenant categoriaId → 400)
 *   - MAN-04: sentinel account find-or-create idempotency
 *   - CA-04: delete-ingesta immunity (manual row with ingestaId=null survives)
 *   - D-06: Origen truthy branch (GET /api/ingresos/mes returns origen='Manual')
 *   - CA-05 / D-07: resumen zero-reader-change (manual Gasto appears in bucket total)
 *   - REG-01: migration CHECK truth table (both violations rejected by DB)
 *   - ISO-01 / ISO-02: user isolation (userId scoping, unauthenticated → 401)
 *
 * Architecture (ADR-005/ADR-016 strict TDD):
 *   - Tests use createApp + createContainer (full HTTP stack — same as other e2e specs)
 *   - Each test creates its own ephemeral users/data and cleans up in afterAll
 *   - No shared global state between describe blocks
 *   - Encryption helpers mirror the container's own AesGcmCryptoService usage
 *   - Amounts MUST NOT appear in any error response body (ADR-013 scrub)
 *
 * Run:
 *   pnpm api test:integration -- registro-manual
 * (requires local Postgres — see apps/api/docs/local-test-db.md)
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv, type Env } from '../src/config/env';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `reg-manual-int-${Date.now()}`;

// ---------------------------------------------------------------------------
// Shared helpers (instantiated once per describe scope)
// ---------------------------------------------------------------------------

/** Compute a past date that is always before today (backfill allowed). */
function pastDate(yearsBack = 1): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsBack);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Compute tomorrow's date as YYYY-MM-DD (UTC). */
function tomorrowDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Current UTC period as YYYY-MM. */
function currentPeriodo(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Setup helpers used across multiple describe blocks
// ---------------------------------------------------------------------------

async function seedUserWithCreds(
  prisma: PrismaClient,
  crypto: AesGcmCryptoService,
  env: Env,
  suffix: string,
): Promise<{ userId: string; email: string; password: string }> {
  const userId = `${RUN_ID}-${suffix}`;
  const email = `${userId}@example.com`;
  const password = `pwd-${suffix}-123`;
  const passwordHash = await new Argon2PasswordHasher().hash(password);
  const encryptedFields = buildEncryptedEmailFields(email, env);
  await prisma.user.upsert({
    where: { id: userId },
    update: { ...encryptedFields, passwordHash },
    create: {
      id: userId,
      nombre: `Test ${suffix}`,
      ...encryptedFields,
      passwordHash,
    },
  });
  await crearCatalogoParaUsuario(prisma, userId);
  return { userId, email, password };
}

async function loginUser(
  app: Express,
  email: string,
  password: string,
): Promise<{ cookie: string; token: string }> {
  const res = await request(app)
    .post('/api/auth/login')
    .set('x-api-key', API_KEY)
    .send({ email, password })
    .expect(200);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie[0].split(';')[0];
  return { cookie, token: res.body.token as string };
}

// ---------------------------------------------------------------------------
// Helper: get a categoriaId that belongs to a specific bucket for a user
// ---------------------------------------------------------------------------

async function getCategoriaIdByBucket(
  prisma: PrismaClient,
  userId: string,
  bucketId: string,
): Promise<string | null> {
  const cat = await prisma.categoria.findFirst({
    where: { userId, bucketId },
    select: { id: true },
  });
  return cat?.id ?? null;
}

// ---------------------------------------------------------------------------
// MAN-01 / MAN-03: domain validation end-to-end
// ---------------------------------------------------------------------------

describe('MAN-01 / MAN-03 — domain validation end-to-end (scrubbed 400)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'man01');
    createdUserIds.push(u.userId);
    ({ cookie } = await loginUser(app, u.email, u.password));
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId } },
      });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.patronClasificacion.deleteMany({ where: { userId } });
      await prisma.categoria.deleteMany({ where: { userId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.$disconnect();
  });

  it('MAN-01: future fecha → 400, amount not in response body', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: tomorrowDate(),
        descripcion: 'Reembolso test',
        monto: '45000',
      })
      .expect(400);

    // Amounts MUST NOT appear in the response (ADR-013 scrub, MAN-01)
    expect(JSON.stringify(res.body)).not.toContain('45000');
  });

  it('MAN-01: monto="0" → 400, scrubbed', async () => {
    if (!ALLOW) return;
    // Not asserting `not.toContain('0')` on the body: the digit "0" is trivially
    // present in any serialized JSON body (cargo/abono defaults, object braces, etc.),
    // making such a check a false negative. The 400 status is the meaningful signal.
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Reembolso test',
        monto: '0',
      })
      .expect(400);
  });

  it('MAN-01: monto="12.50" (float) → 400, scrubbed', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Compra test',
        monto: '12.50',
      })
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('12.50');
  });

  it('MAN-01: descripcion="" → 400', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: '',
        monto: '10000',
      })
      .expect(400);
  });

  it('MAN-03: Gasto missing bucket → 400 (Zod discriminated union enforcement)', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Feria test',
        monto: '5000',
        // bucket is intentionally absent
        categoriaId: 'some-cat',
      })
      .expect(400);
  });

  it('MAN-03: Gasto missing categoriaId → 400', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Feria test',
        monto: '5000',
        bucket: 'Deseos',
        // categoriaId intentionally absent
      })
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// MAN-02: Ingreso auto-classification
// ---------------------------------------------------------------------------

describe('MAN-02 — Ingreso auto-classification (no catalog call, stray bucket → 400)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'man02');
    userId = u.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, u.email, u.password));
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.$disconnect();
  });

  it('MAN-02: valid Ingreso → 201, persisted with bucketId=Ingreso, categoriaId=null, ingestaId=null, origen=Manual', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Reembolso caja chica',
        monto: '45000',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      bucket: 'Ingreso',
      categoriaId: null,
      origen: 'Manual',
      cargo: '0',
      abono: '45000',
    });
    expect(typeof res.body.id).toBe('string');

    // Verify DB row
    const tx = await prisma.transaccion.findFirst({
      where: {
        id: res.body.id,
      },
    });
    expect(tx).not.toBeNull();
    expect(tx!.ingestaId).toBeNull();
    expect(tx!.origen).toBe('Manual');
    expect(tx!.bucketId).toBe(BUCKET_IDS[Bucket.Ingreso]);
    expect(tx!.categoriaId).toBeNull();
    expect(tx!.cargo).toBe(0n);
    expect(tx!.abono).toBe(45000n);

    // Verify sentinel account
    const account = await prisma.account.findUnique({
      where: { id: tx!.accountId },
    });
    expect(account).not.toBeNull();
    expect(account!.banco).toBe('Manual');
    expect(account!.userId).toBe(userId);
  });

  it('MAN-02: Ingreso with stray bucket="Deseos" → 400 (.strict() discriminated union)', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Test reembolso',
        monto: '10000',
        bucket: 'Deseos', // stray field — must be rejected by .strict()
      })
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// MAN-03: Gasto cascade
// ---------------------------------------------------------------------------

describe('MAN-03 — Gasto cascade (catalog validation)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  let userIdB: string;
  let deseosCategoriaId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );

    const uA = await seedUserWithCreds(prisma, crypto, env, 'man03a');
    userId = uA.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, uA.email, uA.password));

    const uB = await seedUserWithCreds(prisma, crypto, env, 'man03b');
    userIdB = uB.userId;
    createdUserIds.push(userIdB);
    // uB session not needed at module level — cross-tenant test only needs userIdB

    // Get a categoriaId from user A's Deseos bucket
    const catDeseos = await getCategoriaIdByBucket(
      prisma,
      userId,
      BUCKET_IDS[Bucket.Deseos],
    );

    expect(catDeseos).not.toBeNull();
    deseosCategoriaId = catDeseos!;
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.$disconnect();
  });

  it('MAN-03: valid Gasto with matching categoriaId + bucket → 201', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Feria del barrio',
        monto: '12990',
        bucket: 'Deseos',
        categoriaId: deseosCategoriaId,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      bucket: 'Deseos',
      categoriaId: deseosCategoriaId,
      origen: 'Manual',
      cargo: '12990',
      abono: '0',
    });

    // Verify DB row
    const tx = await prisma.transaccion.findFirst({
      where: { id: res.body.id },
    });
    expect(tx).not.toBeNull();
    expect(tx!.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(tx!.categoriaId).toBe(deseosCategoriaId);
    expect(tx!.ingestaId).toBeNull();
    expect(tx!.origen).toBe('Manual');
  });

  it('MAN-03: categoriaId outside caller catalog → 400 (CategoriaFueraDeCatalogoError)', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Test compra',
        monto: '5000',
        bucket: 'Deseos',
        categoriaId: 'cat-nonexistent-000000',
      })
      .expect(400);
  });

  it('MAN-03: categoriaId in catalog but wrong bucket → 400 (BucketCategoriaNoConcuerdaError)', async () => {
    if (!ALLOW) return;
    // deseosCategoriaId maps to Deseos, but we send bucket=Necesidades
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Test bucket mismatch',
        monto: '5000',
        bucket: 'Necesidades',
        categoriaId: deseosCategoriaId, // belongs to Deseos, not Necesidades
      })
      .expect(400);
  });

  it('MAN-03: cross-tenant categoriaId (belongs to user B, used by user A) → 400', async () => {
    if (!ALLOW) return;
    // Get a categoria from user B's catalog
    const catBDeseos = await getCategoriaIdByBucket(
      prisma,
      userIdB,
      BUCKET_IDS[Bucket.Deseos],
    );
    expect(catBDeseos).not.toBeNull();

    // User A tries to register with user B's categoriaId
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie) // user A session
      .send({
        tipo: 'Gasto',
        fecha: pastDate(),
        descripcion: 'Cross-tenant attempt',
        monto: '5000',
        bucket: 'Deseos',
        categoriaId: catBDeseos!, // belongs to user B
      })
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// MAN-04: sentinel account find-or-create idempotency
// ---------------------------------------------------------------------------

describe('MAN-04 — Sentinel account idempotency (find-or-create)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'man04');
    userId = u.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, u.email, u.password));
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('MAN-04: first POST creates exactly one sentinel Account(banco=Manual); second POST reuses it — no second sentinel row', async () => {
    if (!ALLOW) return;

    // First movement — sentinel account is created
    const res1 = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Primer movimiento manual',
        monto: '10000',
      })
      .expect(201);

    const sentinelAccountsBefore = await prisma.account.findMany({
      where: { userId, banco: 'Manual' },
    });
    expect(sentinelAccountsBefore).toHaveLength(1);
    const sentinelId = sentinelAccountsBefore[0].id;

    // Second movement — sentinel account is reused, not duplicated
    const res2 = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Segundo movimiento manual',
        monto: '20000',
      })
      .expect(201);

    const sentinelAccountsAfter = await prisma.account.findMany({
      where: { userId, banco: 'Manual' },
    });
    // Must still be exactly ONE sentinel account — idempotent upsert (D-05)
    expect(sentinelAccountsAfter).toHaveLength(1);
    expect(sentinelAccountsAfter[0].id).toBe(sentinelId);

    // Verify both transactions point to the same sentinel accountId
    const [tx1, tx2] = await Promise.all([
      prisma.transaccion.findUnique({ where: { id: res1.body.id } }),
      prisma.transaccion.findUnique({ where: { id: res2.body.id } }),
    ]);
    expect(tx1!.accountId).toBe(sentinelId);
    expect(tx2!.accountId).toBe(sentinelId);
    expect(tx1!.ingestaId).toBeNull();
    expect(tx2!.ingestaId).toBeNull();
    expect(tx1!.origen).toBe('Manual');
    expect(tx2!.origen).toBe('Manual');
  });
});

// ---------------------------------------------------------------------------
// CA-04: delete-ingesta immunity
// ---------------------------------------------------------------------------

describe('CA-04 — delete-ingesta immunity (manual row with ingestaId=null survives)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  let ingestaId: string;
  let ingestaTxId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'ca04');
    userId = u.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, u.email, u.password));

    // Create an ingesta-born transaction for the same user
    const account = await prisma.account.create({
      data: {
        userId,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: crypto.encrypt(`bci-ca04-${RUN_ID}`),
      },
    });
    const ingesta = await prisma.ingesta.create({
      data: {
        userId,
        accountId: account.id,
        banco: 'BCI',
        nombreArchivo: `test-ca04-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 1,
      },
    });
    ingestaId = ingesta.id;

    const ingestaTx = await prisma.transaccion.create({
      data: {
        accountId: account.id,
        ingestaId: ingestaId,
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        cargo: 5000n,
        abono: 0n,
        fecha: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 10),
        ),
        descripcion: crypto.encrypt('Ingesta-born tx CA-04'),
      },
    });
    ingestaTxId = ingestaTx.id;
  });

  afterAll(async () => {
    // transacciones cleanup: manual rows (null ingestaId) by account userId
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.ingesta.deleteMany({ where: { userId: uid } });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('CA-04: manual row (ingestaId=null) survives DELETE /api/ingestas/:id; ingesta-born row is deleted', async () => {
    if (!ALLOW) return;

    // Register a manual movement
    const manualRes = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Manual row to survive delete-ingesta',
        monto: '25000',
      })
      .expect(201);

    const manualTxId = manualRes.body.id as string;

    // Delete the ingesta (which should cascade to ingestaTx only)
    await request(app)
      .delete(`/api/ingestas/${ingestaId}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // Ingesta-born transaction MUST be gone
    const ingestaTx = await prisma.transaccion.findUnique({
      where: { id: ingestaTxId },
    });
    expect(ingestaTx).toBeNull();

    // Manual transaction MUST still exist (ingestaId=null — SQL NULL != cuid)
    const manualTx = await prisma.transaccion.findUnique({
      where: { id: manualTxId },
    });
    expect(manualTx).not.toBeNull();
    expect(manualTx!.ingestaId).toBeNull();
    expect(manualTx!.origen).toBe('Manual');
  });
});

// ---------------------------------------------------------------------------
// D-06: Origen truthy branch (GET /api/ingresos/mes returns origen='Manual')
// ---------------------------------------------------------------------------

describe('D-06 — Origen truthy branch (GET /api/ingresos/mes shows origen="Manual")', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'd06');
    userId = u.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, u.email, u.password));
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('D-06: manual Ingreso row appears in GET /api/ingresos/mes with origen="Manual" (truthy branch)', async () => {
    if (!ALLOW) return;

    const periodo = currentPeriodo();

    // Register a manual Ingreso in the current period
    const manualRes = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Ingreso',
        fecha: new Date().toISOString().slice(0, 10), // today
        descripcion: 'Sueldo manual para D-06',
        monto: '500000',
      })
      .expect(201);

    const manualId = manualRes.body.id as string;

    // Call GET /api/ingresos/mes for the current period
    const ingresosRes = await request(app)
      .get(`/api/ingresos/mes?periodo=${periodo}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // Find the manual row in the response
    const txs = ingresosRes.body.transacciones as Array<{
      id: string;
      origen: string;
    }>;
    const manualTx = txs.find((t) => t.id === manualId);

    expect(manualTx).toBeDefined();
    // The sentinel account has banco='Manual' (truthy), so `fila.banco || 'Manual'`
    // in ObtenerIngresosMesUseCase returns the LEFT operand (fila.banco, whose
    // value is 'Manual') — not the right-side literal 'Manual', which would only
    // be returned in the falsy/fallback branch. The result is 'Manual' either way,
    // but the code path is the truthy branch (D-06, US-052 Origen derivation).
    expect(manualTx!.origen).toBe('Manual');
  });
});

// ---------------------------------------------------------------------------
// CA-05 / D-07: resumen zero-reader-change
// ---------------------------------------------------------------------------

describe('CA-05 / D-07 — resumen zero-reader-change (manual Gasto appears in bucket total)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookie: string;
  let userId: string;
  let deseosCategoriaId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const u = await seedUserWithCreds(prisma, crypto, env, 'ca05');
    userId = u.userId;
    createdUserIds.push(userId);
    ({ cookie } = await loginUser(app, u.email, u.password));

    // Fetch the Deseos categoriaId so the CA-05 test can register a Gasto in that bucket
    const catDeseos = await getCategoriaIdByBucket(
      prisma,
      userId,
      BUCKET_IDS[Bucket.Deseos],
    );
    expect(catDeseos).not.toBeNull();
    deseosCategoriaId = catDeseos!;
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('CA-05: manual Gasto (bucket=Deseos) appears in GET /api/resumen Deseos.total (no reader change needed)', async () => {
    if (!ALLOW) return;

    const periodo = currentPeriodo();
    const monto = '12000';

    // Register a manual Gasto in the current period
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({
        tipo: 'Gasto',
        fecha: new Date().toISOString().slice(0, 10),
        descripcion: 'Feria CA-05',
        monto,
        bucket: 'Deseos',
        categoriaId: deseosCategoriaId,
      })
      .expect(201);

    // Query resumen for the current period
    const resumenRes = await request(app)
      .get(`/api/resumen?periodo=${periodo}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // GET /api/resumen returns { totalIngreso, buckets: Array<{bucket, total, ...}>, ... }
    // (ResumenMesDto — see infrastructure/http/dto/resumen-mes.dto.ts)
    const deseosBucket = (
      resumenRes.body.buckets as Array<{ bucket: string; total: string }>
    ).find((b) => b.bucket === 'Deseos');

    // This user was freshly created and only has one transaction: the Gasto above.
    // Deseos.total must equal exactly 12000 (spec scenario CA-05 / D-07).
    expect(deseosBucket?.total).toBe('12000');
  });
});

// ---------------------------------------------------------------------------
// REG-01: migration CHECK truth table
// ---------------------------------------------------------------------------

describe('REG-01 — migration CHECK truth table (Transaccion_origen_ingesta_consistency)', () => {
  let prisma: PrismaClient;
  let userId: string;
  let accountId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );

    userId = `${RUN_ID}-reg01`;
    createdUserIds.push(userId);
    await prisma.user.create({ data: { id: userId, nombre: 'REG-01 User' } });

    const acc = await prisma.account.create({
      data: {
        userId,
        banco: 'REG01Bank',
        tipoCuenta: 'Corriente',
        // Encrypt numeroCuenta consistent with ADR-013 and the rest of the test suite
        numeroCuenta: crypto.encrypt(`reg01-${RUN_ID}`),
      },
    });
    accountId = acc.id;

    // Create a real ingesta for inserting ingesta-born rows
    const ingesta = await prisma.ingesta.create({
      data: {
        userId,
        accountId,
        banco: 'REG01Bank',
        nombreArchivo: `reg01-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 0,
      },
    });

    // Insert a valid ingesta-born row (ingestaId set, origen=null) —
    // truth table row 3: PASSES
    await prisma.$executeRaw`
      INSERT INTO "Transaccion" ("accountId", "ingestaId", "origen", "fecha", "cargo", "abono", "descripcion")
      VALUES (${accountId}, ${ingesta.id}, NULL, NOW(), 0, 10000, 'ingesta-born-reg01')
    `;
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { accountId },
    });
    await prisma.ingesta.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('REG-01 (row 2): valid manual row (ingestaId=null, origen=Manual) PASSES CHECK', async () => {
    if (!ALLOW) return;
    // This insert must succeed — row 2 of the truth table: PASSES
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Transaccion" ("accountId", "ingestaId", "origen", "fecha", "cargo", "abono", "descripcion")
        VALUES (${accountId}, NULL, 'Manual', NOW(), 0, 20000, 'manual-row-reg01')
      `,
    ).resolves.toBeDefined();
  });

  it('REG-01 (row 1): REJECTED — (ingestaId=null, origen=null) violates CHECK (null-safe form)', async () => {
    if (!ALLOW) return;
    // Row 1: ingestaId=NULL, origen=NULL → LHS TRUE, RHS FALSE → REJECTED.
    // The naive form (origen = 'Manual') would silently pass this (NULL = 'Manual' is NULL → passes).
    // The null-safe IS NOT DISTINCT FROM form correctly rejects it.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Transaccion" ("accountId", "ingestaId", "origen", "fecha", "cargo", "abono", "descripcion")
        VALUES (${accountId}, NULL, NULL, NOW(), 0, 30000, 'check-violation-row1')
      `,
    ).rejects.toThrow();
  });

  it('REG-01 (row 4): REJECTED — (ingestaId set, origen=Manual) violates CHECK', async () => {
    if (!ALLOW) return;
    // Row 4: ingestaId set, origen='Manual' → LHS FALSE, RHS TRUE → REJECTED.
    // An ingesta row cannot claim Manual origin.
    const ingesta = await prisma.ingesta.create({
      data: {
        userId,
        accountId,
        banco: 'REG01Bank',
        nombreArchivo: `reg01-row4-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 0,
      },
    });
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Transaccion" ("accountId", "ingestaId", "origen", "fecha", "cargo", "abono", "descripcion")
        VALUES (${accountId}, ${ingesta.id}, 'Manual', NOW(), 0, 40000, 'check-violation-row4')
      `,
    ).rejects.toThrow();

    // Cleanup the ingesta row
    await prisma.ingesta.delete({ where: { id: ingesta.id } });
  });

  it('REG-01 (row 3 backward-compat): existing ingesta-born rows (ingestaId set, origen=null) PASS CHECK', async () => {
    if (!ALLOW) return;
    // Row 3: ingestaId non-null, origen=NULL → LHS FALSE, RHS FALSE → PASSES.
    // Verifies backward compatibility: existing ingesta rows are not affected by the migration.
    const count = await prisma.transaccion.count({
      where: {
        accountId,
        origen: null,
        ingestaId: { not: null },
      },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ISO-01 / ISO-02: user isolation
// ---------------------------------------------------------------------------

describe('ISO-01 / ISO-02 — user isolation (userId scoping, unauthenticated → 401)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let cookieA: string;
  let cookieB: string;
  let userIdA: string;
  let userIdB: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );

    const uA = await seedUserWithCreds(prisma, crypto, env, 'iso01a');
    userIdA = uA.userId;
    createdUserIds.push(userIdA);
    ({ cookie: cookieA } = await loginUser(app, uA.email, uA.password));

    const uB = await seedUserWithCreds(prisma, crypto, env, 'iso01b');
    userIdB = uB.userId;
    createdUserIds.push(userIdB);
    ({ cookie: cookieB } = await loginUser(app, uB.email, uB.password));
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.patronClasificacion.deleteMany({ where: { userId: uid } });
      await prisma.categoria.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('ISO-01: unauthenticated POST /api/movimientos → 401 (middleware gate)', async () => {
    if (!ALLOW) return;
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      // No session cookie — not authenticated
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'Unauthorized attempt',
        monto: '10000',
      })
      .expect(401);
  });

  it('ISO-02: user B POST registers movement under userId B; user A resumen is unaffected', async () => {
    if (!ALLOW) return;

    const periodo = currentPeriodo();

    // Get user A's resumen BEFORE user B registers anything
    const resumenBeforeRes = await request(app)
      .get(`/api/resumen?periodo=${periodo}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    // User B registers a manual movement in the current period
    const manualRes = await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieB) // user B session
      .send({
        tipo: 'Ingreso',
        fecha: new Date().toISOString().slice(0, 10),
        descripcion: 'User B isolation test',
        monto: '999000',
      })
      .expect(201);

    // Verify the created row belongs to user B
    const tx = await prisma.transaccion.findUnique({
      where: { id: manualRes.body.id },
      include: { account: true },
    });
    expect(tx).not.toBeNull();
    expect(tx!.account.userId).toBe(userIdB);

    // Get user A's resumen AFTER user B's registration — must be unchanged
    const resumenAfterRes = await request(app)
      .get(`/api/resumen?periodo=${periodo}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    // User A's resumen totals must be identical (B's data never leaks to A)
    expect(JSON.stringify(resumenAfterRes.body)).toBe(
      JSON.stringify(resumenBeforeRes.body),
    );
  });

  it('ISO-02: sentinel account is per-user (each user gets their own Manual account)', async () => {
    if (!ALLOW) return;

    // Both users register a manual movement
    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'User A sentinel test',
        monto: '1000',
      })
      .expect(201);

    await request(app)
      .post('/api/movimientos')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieB)
      .send({
        tipo: 'Ingreso',
        fecha: pastDate(),
        descripcion: 'User B sentinel test',
        monto: '2000',
      })
      .expect(201);

    // Each user must have their own sentinel account
    const sentinelA = await prisma.account.findMany({
      where: { userId: userIdA, banco: 'Manual' },
    });
    const sentinelB = await prisma.account.findMany({
      where: { userId: userIdB, banco: 'Manual' },
    });

    expect(sentinelA).toHaveLength(1);
    expect(sentinelB).toHaveLength(1);
    // They must be different accounts
    expect(sentinelA[0].id).not.toBe(sentinelB[0].id);
  });
});
