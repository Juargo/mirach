/**
 * E2E tests for GET /api/buckets/:bucket/detalle (US-051).
 *
 * Requires a real DB (same dev DB as `detalle-bucket.e2e-spec.ts`). Run via
 * `pnpm api test:e2e` (sets ALLOW_DESTRUCTIVE_DB=1). Seeds its own rows per
 * RUN_ID and cleans up in afterAll (transacciones + ingestas + accounts +
 * categorias + sessions + users), same helper shape as
 * `resumen-semaforo.e2e-spec.ts`.
 *
 * CRITICAL (ADR-013): `PrismaDetalleBucketRepository` decrypts
 * `descripcion`/`numeroCuenta` with `AesGcmCryptoService` (fail-loud) — every
 * seeded descripcion/numeroCuenta MUST be cifrado con la MISMA clave de
 * `.env.test` (pattern `movimientos.e2e-spec.ts`), nunca texto plano.
 *
 * Covered scenarios (design §4 ledger — 7 + W-1):
 *   - sin periodo → 200, periodo = mes UTC actual (MBD-04)
 *   - ?periodo=not-a-date → 400, body scrubbed (MBD-04)
 *   - DTO shape — header + grupos + transacciones {id, fecha, descripcion,
 *     monto}, las 5 transacciones presentes, sin paginación, sin PII (MBD-02/08)
 *   - mes vacío del bucket → total "0", 0, 0, grupos [] (MBD-01)
 *   - montos > MAX_SAFE_INTEGER exactos en el wire (MBD-05)
 *   - aislamiento de dos usuarios — B nunca aparece en A (MBD-06/ISO-02)
 *   - Ingresos → 400 scrubbed (MBD-07)
 *   - W-1: header lleno, ingreso 1 500 000 → total "250000", 5 txs,
 *     2 categorías, porcentajeBp 1667, Σ conteo === totalTransacciones
 */
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
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `bucket-detalle-mes-e2e-${Date.now()}`;
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;

/** Fechas DENTRO del mes actual, en orden ascendente (días 3..15). */
function diaDelMes(dia: number): Date {
  return new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), dia));
}

describe('BucketDetalleMes (e2e) — GET /api/buckets/:bucket/detalle', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;
  let env: Env;
  let crypto: AesGcmCryptoService;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
    // Misma clave que container.ts — NO la de test/support/env.fixture.ts
    // (mismo patrón probado que ingesta/movimientos e2e, ADR-013).
    crypto = new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
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
    // CA-08: logins de usuarios frescos crean Session reales (FK Restrict).
    await prisma.categoria.deleteMany({
      where: { userId: { startsWith: RUN_ID } },
    });
    await prisma.session.deleteMany({
      where: { userId: { startsWith: RUN_ID } },
    });
    await prisma.user.deleteMany({
      where: { id: { startsWith: RUN_ID } },
    });
    await prisma.$disconnect();
  });

  // ── Helpers (mirrors resumen-semaforo.e2e-spec.ts) ────────────────────

  /** Usuario sin credenciales — para el "alien" de la prueba de aislamiento. */
  async function seedUser(suffix: string): Promise<string> {
    const userId = `${RUN_ID}-${suffix}`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: `E2E User ${suffix}` },
    });
    return userId;
  }

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
    const numeroCuenta = `ACC-${suffix}`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        // Cifrado (misma clave que container.ts) — el reader lo descifra.
        numeroCuenta: crypto.encrypt(numeroCuenta),
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

  /** Categoria por-usuario (US-037): solo existe para un userId dado. */
  async function seedCategoria(
    userId: string,
    suffix: string,
    bucketId: string,
  ): Promise<string> {
    const categoriaId = `${RUN_ID}-cat-${suffix}`;
    await prisma.categoria.upsert({
      where: { id: categoriaId },
      update: {},
      create: {
        id: categoriaId,
        userId,
        nombre: suffix.charAt(0).toUpperCase() + suffix.slice(1),
        bucketId,
      },
    });
    return categoriaId;
  }

  async function seedTx(opts: {
    accountId: string;
    ingestaId: string;
    bucketId: string | null;
    categoriaId: string | null;
    cargo: bigint;
    abono: bigint;
    descripcion: string;
    dia: number;
  }): Promise<void> {
    await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: opts.bucketId,
        categoriaId: opts.categoriaId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: diaDelMes(opts.dia),
        descripcion: crypto.encrypt(opts.descripcion),
      },
    });
  }

  /**
   * Estado W-1 conocido (design §5): ingreso 1 500 000 + 5 cargos en
   * Necesidades (3 Comida = 150 000, 2 sin categoría = 100 000) → total
   * 250 000, porcentajeBp round-half-up 1666.66… → 1667.
   */
  async function seedEstadoW1(userId: string, suffix: string): Promise<void> {
    const accountId = await seedAccount(userId, suffix);
    const ingestaId = await seedIngesta(accountId, suffix, userId);
    const comidaId = await seedCategoria(
      userId,
      'comida',
      BUCKET_IDS[Bucket.Necesidades],
    );

    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      categoriaId: null,
      cargo: 0n,
      abono: 1_500_000n,
      descripcion: `Ingreso W1 ${RUN_ID}`,
      dia: 2,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: comidaId,
      cargo: 90_000n,
      abono: 0n,
      descripcion: `Jumbo W1 ${RUN_ID}`,
      dia: 3,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: comidaId,
      cargo: 40_000n,
      abono: 0n,
      descripcion: `Santa Isabel W1 ${RUN_ID}`,
      dia: 5,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: comidaId,
      cargo: 20_000n,
      abono: 0n,
      descripcion: `Mercado W1 ${RUN_ID}`,
      dia: 7,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: null,
      cargo: 60_000n,
      abono: 0n,
      descripcion: `Giro W1 ${RUN_ID}`,
      dia: 9,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: null,
      cargo: 40_000n,
      abono: 0n,
      descripcion: `Cuota W1 ${RUN_ID}`,
      dia: 11,
    });
  }

  // ── MBD-04: sin periodo → mes actual; inválido → 400 scrubbed ─────────

  it('sin periodo → 200 con el periodo UTC actual (MBD-04)', async () => {
    const res = await request(app)
      .get('/api/buckets/Necesidades/detalle')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.periodo).toBe(CURRENT_PERIODO);
    expect(res.body.bucket).toBe(Bucket.Necesidades);
  });

  it('?periodo=not-a-date → 400, body scrubbed (MBD-04)', async () => {
    const res = await request(app)
      .get('/api/buckets/Necesidades/detalle?periodo=not-a-date')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
  });

  // ── MBD-02/08: DTO shape — 5 txs presentes, sin paginación, sin PII ────

  it('DTO shape — 5 transacciones completas en 2 grupos, sin paginación ni PII (MBD-02/08)', async () => {
    if (!ALLOW) return;
    const password = 'dto-shape-password-123';
    const { userId } = await seedUserWithCredentials('shape', password);
    await seedEstadoW1(userId, 'shape');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: `${userId}@example.com`, password })
      .expect(200);
    const cookie = (
      loginRes.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const res = await request(app)
      .get(`/api/buckets/Necesidades/detalle?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // Header (MBD-01).
    expect(typeof res.body.total).toBe('string');
    expect(res.body.totalTransacciones).toBe(5);
    expect(res.body.totalCategorias).toBe(2);

    // Dos grupos con la forma acordada (MBD-02).
    expect(res.body.grupos).toHaveLength(2);
    for (const grupo of res.body.grupos) {
      expect(grupo).toHaveProperty('categoriaId');
      expect(typeof grupo.nombre).toBe('string');
      expect(typeof grupo.subtotal).toBe('string');
      expect(typeof grupo.conteo).toBe('number');
      expect(Array.isArray(grupo.transacciones)).toBe(true);
    }

    // TODAS las transacciones presentes — ninguna truncada ni paginada.
    const todas = res.body.grupos.flatMap(
      (g: { transacciones: unknown[] }) => g.transacciones,
    );
    expect(todas).toHaveLength(5);
    expect(
      res.body.grupos.reduce(
        (acc: number, g: { conteo: number }) => acc + g.conteo,
        0,
      ),
    ).toBe(5);

    // Cada transacción expone EXACTAMENTE {id, fecha, descripcion, monto}.
    for (const tx of todas as Array<Record<string, unknown>>) {
      expect(Object.keys(tx).sort()).toEqual([
        'descripcion',
        'fecha',
        'id',
        'monto',
      ]);
      expect(typeof tx.fecha).toBe('string');
      expect(() => new Date(tx.fecha as string)).not.toThrow();
      expect(typeof tx.monto).toBe('string');
    }
    // Las descripciones cifradas round-trippan (ADR-013).
    const descripciones = JSON.stringify(
      todas.map((t: Record<string, unknown>) => t.descripcion),
    );
    expect(descripciones).toContain(`Jumbo W1 ${RUN_ID}`);
    expect(descripciones).toContain(`Giro W1 ${RUN_ID}`);

    // Sin PII de cuenta en NINGÚN lado (MBD-08/ADR-015).
    const bodySerializado = JSON.stringify(res.body);
    expect(bodySerializado).not.toContain('TestBank');
    expect(bodySerializado).not.toContain('CuentaCorriente');
    expect(bodySerializado).not.toContain(`ACC-shape`);
    expect(bodySerializado).not.toContain('banco');
    expect(bodySerializado).not.toContain('tipoCuenta');
    expect(bodySerializado).not.toContain('numeroCuenta');
  });

  // ── MBD-01: mes vacío del bucket → ceroes, grupos [] ───────────────────

  it('mes vacío del bucket → total "0", 0, 0, grupos [] (MBD-01)', async () => {
    const res = await request(app)
      .get('/api/buckets/Ahorro/detalle?periodo=2099-12')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.total).toBe('0');
    expect(res.body.totalTransacciones).toBe(0);
    expect(res.body.totalCategorias).toBe(0);
    expect(res.body.grupos).toEqual([]);
  });

  // ── MBD-05: BigInt exacto más allá de MAX_SAFE_INTEGER ─────────────────

  it('montos > Number.MAX_SAFE_INTEGER exactos en el wire (MBD-05)', async () => {
    if (!ALLOW) return;
    const password = 'maxsafe-password-123';
    const { userId } = await seedUserWithCredentials('maxsafe', password);
    const accountId = await seedAccount(userId, 'maxsafe');
    const ingestaId = await seedIngesta(accountId, 'maxsafe', userId);
    const comidaId = await seedCategoria(
      userId,
      'comida',
      BUCKET_IDS[Bucket.Necesidades],
    );
    const bigAmount = 9007199254740993n; // MAX_SAFE_INTEGER + 1

    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      categoriaId: null,
      cargo: 0n,
      abono: 1_500_000n,
      descripcion: `Ingreso MAX ${RUN_ID}`,
      dia: 2,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: comidaId,
      cargo: bigAmount,
      abono: 0n,
      descripcion: `Grande A ${RUN_ID}`,
      dia: 3,
    });
    await seedTx({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: comidaId,
      cargo: bigAmount,
      abono: 0n,
      descripcion: `Grande B ${RUN_ID}`,
      dia: 5,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: `${userId}@example.com`, password })
      .expect(200);
    const cookie = (
      loginRes.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const res = await request(app)
      .get(`/api/buckets/Necesidades/detalle?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // 2 × 9007199254740993 = 18014398509481986 — exacto, cero pérdida.
    expect(res.body.total).toBe('18014398509481986');
    expect(res.body.totalTransacciones).toBe(2);
    expect(res.body.grupos).toHaveLength(1);
    expect(res.body.grupos[0].subtotal).toBe('18014398509481986');
    const montos = res.body.grupos[0].transacciones.map(
      (tx: { monto: string }) => tx.monto,
    );
    expect(montos).toEqual(['9007199254740993', '9007199254740993']);
  });

  // ── MBD-06: aislamiento de dos usuarios (ISO-02) ───────────────────────

  it('aislamiento de dos usuarios — los datos de B nunca aparecen en A (MBD-06)', async () => {
    if (!ALLOW) return;

    // Usuario A — estado W-1 conocido (ingreso 1_500_000, total 250 000).
    const passwordA = 'iso-a-password-123';
    const { userId: userA } = await seedUserWithCredentials('iso-a', passwordA);
    await seedEstadoW1(userA, 'iso-a');
    const alienUserId = await seedUser('iso-alien');

    // Alien B — ESTADO DISTINTO: ingreso 5_000_000, un cargo masivo de
    // 4_000_000 en Necesidades dentro de OTRA categoría (Viajes).
    const alienAccountId = await seedAccount(alienUserId, 'iso-alien');
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-alien',
      alienUserId,
    );
    const viajesId = await seedCategoria(
      alienUserId,
      'viajes',
      BUCKET_IDS[Bucket.Necesidades],
    );
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
      categoriaId: null,
      cargo: 0n,
      abono: 5_000_000n,
      descripcion: `Ingreso alien ${RUN_ID}`,
      dia: 2,
    });
    await seedTx({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      categoriaId: viajesId,
      cargo: 4_000_000n,
      abono: 0n,
      descripcion: `Viaje alien ${RUN_ID}`,
      dia: 4,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: `${userA}@example.com`, password: passwordA })
      .expect(200);
    const cookieA = (
      loginRes.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const res = await request(app)
      .get(`/api/buckets/Necesidades/detalle?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieA)
      .expect(200);

    // Match EXACTO sobre el estado conocido de A (CA-08): descarta tanto
    // leak-in como leak-replace.
    expect(res.body.total).toBe('250000');
    expect(res.body.totalTransacciones).toBe(5);
    expect(res.body.totalCategorias).toBe(2);
    expect(res.body.porcentajeBp).toBe(1667);
    expect(res.body.grupos.map((g: { nombre: string }) => g.nombre)).toEqual([
      'Comida',
      'Sin categoría',
    ]);

    // Nada del alien B en el wire: ni ids, ni montos, ni su categoría.
    const bodySerializado = JSON.stringify(res.body);
    expect(bodySerializado).not.toContain(alienUserId);
    expect(bodySerializado).not.toContain('4000000');
    expect(bodySerializado).not.toContain('Viajes');
    expect(bodySerializado).not.toContain(`${RUN_ID}-cat-iso-alien`);
  });

  // ── MBD-07: Ingresos fuera de alcance → 400 ────────────────────────────

  it('Ingresos → 400 scrubbed (MBD-07)', async () => {
    const res = await request(app)
      .get('/api/buckets/Ingresos/detalle')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('Ingresos');
    // El mensaje lista la allowlist de 4 buckets de gasto (D-08/D-07).
    expect(JSON.stringify(res.body)).toContain('Necesidades');
    expect(JSON.stringify(res.body)).toContain('SinCategoria');
  });

  // ── W-1: header lleno con ingreso 1 500 000 ────────────────────────────

  it('W-1: ingreso 1 500 000 → total "250000", 5 txs, 2 categorías, porcentajeBp 1667, Σ conteo === totalTransacciones', async () => {
    if (!ALLOW) return;
    const password = 'w1-password-123';
    const { userId } = await seedUserWithCredentials('w1', password);
    await seedEstadoW1(userId, 'w1');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: `${userId}@example.com`, password })
      .expect(200);
    const cookie = (
      loginRes.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const res = await request(app)
      .get(`/api/buckets/Necesidades/detalle?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.periodo).toBe(CURRENT_PERIODO);
    expect(res.body.bucket).toBe(Bucket.Necesidades);
    expect(res.body.total).toBe('250000');
    expect(res.body.totalTransacciones).toBe(5);
    expect(res.body.totalCategorias).toBe(2);
    // round-half-up single-shot (D-04): 250000/1500000 = 1666.66… bp → 1667.
    expect(res.body.porcentajeBp).toBe(1667);
    expect(res.body.metaBp).toBe(5000);
    expect(res.body.grupos.map((g: { nombre: string }) => g.nombre)).toEqual([
      'Comida',
      'Sin categoría',
    ]);
    // Σ conteo === totalTransacciones — cada tx vive en exactamente un grupo.
    const sumaconteo = res.body.grupos.reduce(
      (acc: number, g: { conteo: number }) => acc + g.conteo,
      0,
    );
    expect(sumaconteo).toBe(res.body.totalTransacciones);
    // El grupo Comida: 3 txs = 150 000; la primera en orden fecha asc.
    const comida = res.body.grupos.find(
      (g: { nombre: string }) => g.nombre === 'Comida',
    );
    expect(comida.conteo).toBe(3);
    expect(comida.subtotal).toBe('150000');
    expect(comida.transacciones[0].monto).toBe('90000');
  });
});
