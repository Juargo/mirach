/**
 * E2E tests for GET /api/ingresos/mes (US-052).
 *
 * Requires a real DB (same dev DB as `bucket-detalle-mes.e2e-spec.ts`). Run via
 * `pnpm api test:e2e` (sets ALLOW_DESTRUCTIVE_DB=1). Seeds its own rows per
 * RUN_ID and cleans up in afterAll, same helper shape as
 * `bucket-detalle-mes.e2e-spec.ts`.
 *
 * CRITICAL (ADR-013): `PrismaDetalleBucketRepository` decrypts
 * `descripcion`/`numeroCuenta` with `AesGcmCryptoService` (fail-loud) — every
 * seeded descripcion/numeroCuenta MUST be cifrado con la MISMA clave de
 * `.env.test`, nunca texto plano.
 *
 * Covered scenarios (design §5 ledger — 7):
 *   - sin periodo → 200 con filas del mes UTC actual; seed en mes actual +
 *     mes anterior, solo aparecen las del actual (MID-04)
 *   - ?periodo=not-a-date → 400, body scrubbed (MID-04)
 *   - DTO shape — exactamente {total, conteo, transacciones} y cada tx
 *     {id, fecha, descripcion, origen, monto} con `origen` = banco del account
 *     seed, sin paginación (MID-01/02)
 *   - mes vacío → "0"/0/[] (MID-01)
 *   - montos > Number.MAX_SAFE_INTEGER exactos en el wire (MID-05)
 *   - aislamiento de dos usuarios — datos de B nunca en A, cookie Y Bearer
 *     (MID-06/ISO-02)
 *   - reconciliación: `total` === resumen-mensual Ingreso `totalAbono`, SPEND
 *     row (`abono>0 && cargo>0`) excluida de ambos (MID-05)
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

const RUN_ID = `ingresos-mes-e2e-${Date.now()}`;
const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = NOW.getUTCMonth();
const CURRENT_PERIODO = `${CURRENT_YEAR}-${String(CURRENT_MONTH + 1).padStart(2, '0')}`;

/** Fecha DENTRO del mes actual (UTC), en orden ascendente por `dia`. */
function diaDelMes(dia: number): Date {
  return new Date(Date.UTC(CURRENT_YEAR, CURRENT_MONTH, dia));
}

describe('IngresosMes (e2e) — GET /api/ingresos/mes', () => {
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
    // (mismo patrón probado que bucket-detalle-mes, ADR-013).
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

  // ── Helpers (mirrors bucket-detalle-mes.e2e-spec.ts) ───────────────────

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

  async function seedAccount(
    userId: string,
    suffix: string,
    banco = 'TestBank',
  ): Promise<string> {
    const accountId = `${RUN_ID}-acc-${suffix}`;
    const numeroCuenta = `ACC-${suffix}`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco,
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

  /** Fila bucket-ingreso (cargo=0, abono>0) — la regla esIngreso (MID-05). */
  async function seedIngreso(opts: {
    accountId: string;
    ingestaId: string;
    abono: bigint;
    descripcion: string;
    dia: number;
  }): Promise<void> {
    await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        categoriaId: null,
        cargo: 0n,
        abono: opts.abono,
        fecha: diaDelMes(opts.dia),
        descripcion: crypto.encrypt(opts.descripcion),
      },
    });
  }

  /**
   * SPEND row (MID-05): `abono > 0 && cargo > 0` en un bucket de GASTO —
   * el categorizador jamás la deja en bucket-ingreso; debe quedar excluida
   * de `total` Y del `totalAbono` Ingreso del resumen.
   */
  async function seedSpend(opts: {
    accountId: string;
    ingestaId: string;
    categoriaId: string;
    cargo: bigint;
    abono: bigint;
    descripcion: string;
    dia: number;
  }): Promise<void> {
    await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        categoriaId: opts.categoriaId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: diaDelMes(opts.dia),
        descripcion: crypto.encrypt(opts.descripcion),
      },
    });
  }

  async function loginCookie(
    userId: string,
    password: string,
  ): Promise<{ cookie: string; token: string }> {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: `${userId}@example.com`, password })
      .expect(200);
    const cookie = (
      loginRes.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    return { cookie, token: loginRes.body.token as string };
  }

  // ── MID-04: sin periodo → mes actual; inválido → 400 scrubbed ──────────

  it('sin periodo → 200 con las filas del mes UTC actual, no las del mes anterior (MID-04)', async () => {
    if (!ALLOW) return;
    // Fechas frescas computadas al INICIO del test (MID-04): el server resuelve
    // `PeriodoMes.actual()` en request-time, así que usar las constantes de
    // module-load (CURRENT_YEAR/CURRENT_MONTH) sería flaky si el mes UTC rota
    // entre el import del módulo y esta petición.
    // Nota (revisión adversarial R2): queda una ventana residual sub-segundo
    // entre ESTE instante y el request (seeds + login). Irreducible sin mockear
    // el reloj; produce falsos fallos únicamente si el suite cruza 00:00 UTC del
    // día 1 exactamente en esa ventana — nunca falsos positivos.
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const diaDelMesLocal = (dia: number): Date =>
      new Date(Date.UTC(currentYear, currentMonth, dia));
    const diaDelMesAnteriorLocal = (dia: number): Date =>
      new Date(Date.UTC(previousYear, previousMonth, dia));

    const password = 'default-password-123';
    const { userId } = await seedUserWithCredentials('default', password);
    const accountId = await seedAccount(userId, 'default');
    const ingestaId = await seedIngesta(accountId, 'default', userId);

    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        categoriaId: null,
        cargo: 0n,
        abono: 100_000n,
        fecha: diaDelMesLocal(5),
        descripcion: crypto.encrypt(`Sueldo ${RUN_ID}`),
      },
    });
    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        categoriaId: null,
        cargo: 0n,
        abono: 200_000n,
        fecha: diaDelMesLocal(10),
        descripcion: crypto.encrypt(`Freelance ${RUN_ID}`),
      },
    });
    // Mes ANTERIOR — window-test: no debe aparecer (MID-04 half-open).
    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        categoriaId: null,
        cargo: 0n,
        abono: 999_999n,
        fecha: diaDelMesAnteriorLocal(15),
        descripcion: crypto.encrypt(`Sueldo previo ${RUN_ID}`),
      },
    });

    const { cookie } = await loginCookie(userId, password);

    const res = await request(app)
      .get('/api/ingresos/mes')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // Solo las 2 filas del mes actual — el mes anterior queda fuera del window.
    expect(res.body.total).toBe('300000');
    expect(res.body.conteo).toBe(2);
    expect(
      res.body.transacciones.map((t: { monto: string }) => t.monto),
    ).toEqual(['100000', '200000']);
    // Las fechas del wire son EXACTAMENTE las de los seeds del mes actual
    // (orden fecha asc) — contra las constantes frescas, no las de module-load.
    expect(
      res.body.transacciones.map((t: { fecha: string }) => t.fecha),
    ).toEqual([
      diaDelMesLocal(5).toISOString(),
      diaDelMesLocal(10).toISOString(),
    ]);
    const bodySerializado = JSON.stringify(res.body);
    expect(bodySerializado).toContain(`Sueldo ${RUN_ID}`);
    expect(bodySerializado).not.toContain('Sueldo previo');
    expect(bodySerializado).not.toContain('999999');
  });

  it('?periodo=not-a-date → 400, body scrubbed (MID-04)', async () => {
    const res = await request(app)
      .get('/api/ingresos/mes?periodo=not-a-date')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
    // La regla que rechazó es la de DOMINIO (`PeriodoMes` →
    // `PeriodoInvalidoError`), no el schema de transporte — el mensaje del
    // dominio aparece en el body (scrubbed del input crudo).
    expect(JSON.stringify(res.body)).toContain('El período no es válido');
  });

  // ── MID-01/02: DTO shape — shape exacta, origen = banco, sin paginación ─

  it('DTO shape — exactamente {total, conteo, transacciones}, cada tx {id, fecha, descripcion, origen, monto}, sin paginación ni PII (MID-01/02)', async () => {
    if (!ALLOW) return;
    const password = 'shape-password-123';
    const { userId } = await seedUserWithCredentials('shape', password);
    const accountId = await seedAccount(userId, 'shape');
    const ingestaId = await seedIngesta(accountId, 'shape', userId);

    await seedIngreso({
      accountId,
      ingestaId,
      abono: 150_000n,
      descripcion: `Sueldo shape ${RUN_ID}`,
      dia: 3,
    });
    await seedIngreso({
      accountId,
      ingestaId,
      abono: 90_000n,
      descripcion: `Freelance shape ${RUN_ID}`,
      dia: 5,
    });
    await seedIngreso({
      accountId,
      ingestaId,
      abono: 60_000n,
      descripcion: `Transferencia shape ${RUN_ID}`,
      dia: 10,
    });

    const { cookie } = await loginCookie(userId, password);

    const res = await request(app)
      .get(`/api/ingresos/mes?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // MID-01/03: EXACTAMENTE {total, conteo, transacciones} — sin
    // meta/porcentaje/estado/periodo en NINGÚN nivel.
    expect(Object.keys(res.body).sort()).toEqual([
      'conteo',
      'total',
      'transacciones',
    ]);
    expect(typeof res.body.total).toBe('string');
    expect(res.body.total).toBe('300000');
    expect(res.body.conteo).toBe(3);

    // Sin paginación: TODAS las transacciones presentes, en orden fecha asc.
    expect(res.body.transacciones).toHaveLength(3);
    expect(
      res.body.transacciones.map((t: { monto: string }) => t.monto),
    ).toEqual(['150000', '90000', '60000']);
    // ISO-8601 UTC exacto (toISOString) — formato Y valores, en orden fecha
    // asc (días seed 3, 5, 10 del mes `CURRENT_PERIODO`).
    expect(
      res.body.transacciones.map((t: { fecha: string }) => t.fecha),
    ).toEqual([
      diaDelMes(3).toISOString(),
      diaDelMes(5).toISOString(),
      diaDelMes(10).toISOString(),
    ]);

    // Cada transacción expone EXACTAMENTE {id, fecha, descripcion, origen, monto}.
    for (const tx of res.body.transacciones as Array<Record<string, unknown>>) {
      expect(Object.keys(tx).sort()).toEqual([
        'descripcion',
        'fecha',
        'id',
        'monto',
        'origen',
      ]);
      expect(typeof tx.fecha).toBe('string');
      expect(typeof tx.monto).toBe('string');
    }
    // `origen` = nombre del banco del account seed, verbatim (MID-02).
    expect(
      res.body.transacciones.map((t: { origen: string }) => t.origen),
    ).toEqual(['TestBank', 'TestBank', 'TestBank']);

    // Las descripciones cifradas round-trippan (ADR-013).
    const descripciones = JSON.stringify(
      res.body.transacciones.map((t: Record<string, unknown>) => t.descripcion),
    );
    expect(descripciones).toContain(`Sueldo shape ${RUN_ID}`);
    expect(descripciones).toContain(`Transferencia shape ${RUN_ID}`);

    // Sin PII de cuenta en NINGÚN lado (MID-06/ADR-015) — la key `origen`
    // lleva el nombre del banco, pero la shape no expone cuenta alguna.
    const bodySerializado = JSON.stringify(res.body);
    expect(bodySerializado).not.toContain('"banco"');
    expect(bodySerializado).not.toContain('"tipoCuenta"');
    expect(bodySerializado).not.toContain('"numeroCuenta"');
    expect(bodySerializado).not.toContain('CuentaCorriente');
    expect(bodySerializado).not.toContain(`ACC-shape`);
  });

  // ── MID-01: mes vacío → ceroes, transacciones [] ───────────────────────

  it('mes vacío → total "0", conteo 0, transacciones [] (MID-01)', async () => {
    const res = await request(app)
      .get('/api/ingresos/mes?periodo=2099-12')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);

    expect(res.body.total).toBe('0');
    expect(res.body.conteo).toBe(0);
    expect(res.body.transacciones).toEqual([]);
  });

  // ── MID-05: BigInt exacto más allá de MAX_SAFE_INTEGER ─────────────────

  it('montos > Number.MAX_SAFE_INTEGER exactos en el wire (MID-05)', async () => {
    if (!ALLOW) return;
    const password = 'maxsafe-password-123';
    const { userId } = await seedUserWithCredentials('maxsafe', password);
    const accountId = await seedAccount(userId, 'maxsafe');
    const ingestaId = await seedIngesta(accountId, 'maxsafe', userId);
    const bigAmount = 9007199254740993n; // primer entero NO representable: 2^53 + 1 (MAX_SAFE_INTEGER + 2)

    await seedIngreso({
      accountId,
      ingestaId,
      abono: bigAmount,
      descripcion: `Ingreso grande A ${RUN_ID}`,
      dia: 3,
    });
    await seedIngreso({
      accountId,
      ingestaId,
      abono: bigAmount,
      descripcion: `Ingreso grande B ${RUN_ID}`,
      dia: 5,
    });

    const { cookie } = await loginCookie(userId, password);

    const res = await request(app)
      .get(`/api/ingresos/mes?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // 2 × 9007199254740993 = 18014398509481986 — exacto, cero pérdida.
    expect(res.body.total).toBe('18014398509481986');
    expect(res.body.conteo).toBe(2);
    const montos = res.body.transacciones.map(
      (t: { monto: string }) => t.monto,
    );
    expect(montos).toEqual(['9007199254740993', '9007199254740993']);
  });

  // ── MID-06: aislamiento de dos usuarios, cookie Y Bearer (ISO-02) ──────

  it('aislamiento de dos usuarios — los datos de B nunca aparecen en A, con cookie Y Bearer (MID-06)', async () => {
    if (!ALLOW) return;

    // Usuario A — estado conocido: 3 ingresos = 300 000 (TestBank).
    const passwordA = 'iso-a-password-123';
    const { userId: userA } = await seedUserWithCredentials('iso-a', passwordA);
    const accountA = await seedAccount(userA, 'iso-a');
    const ingestaA = await seedIngesta(accountA, 'iso-a', userA);
    await seedIngreso({
      accountId: accountA,
      ingestaId: ingestaA,
      abono: 150_000n,
      descripcion: `Ingreso A ${RUN_ID}`,
      dia: 2,
    });
    await seedIngreso({
      accountId: accountA,
      ingestaId: ingestaA,
      abono: 100_000n,
      descripcion: `Ingreso B ${RUN_ID}`,
      dia: 4,
    });
    await seedIngreso({
      accountId: accountA,
      ingestaId: ingestaA,
      abono: 50_000n,
      descripcion: `Ingreso C ${RUN_ID}`,
      dia: 8,
    });

    // Alien B — ESTADO DISTINTO: banco diferente y 2 ingresos por 5 000 000.
    const alienUserId = await seedUser('iso-alien');
    const alienAccountId = await seedAccount(
      alienUserId,
      'iso-alien',
      'BancoAlien',
    );
    const alienIngestaId = await seedIngesta(
      alienAccountId,
      'iso-alien',
      alienUserId,
    );
    await seedIngreso({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      abono: 5_000_000n,
      descripcion: `Ingreso alien 1 ${RUN_ID}`,
      dia: 3,
    });
    await seedIngreso({
      accountId: alienAccountId,
      ingestaId: alienIngestaId,
      abono: 5_000_000n,
      descripcion: `Ingreso alien 2 ${RUN_ID}`,
      dia: 6,
    });

    const { cookie, token } = await loginCookie(userA, passwordA);

    // Cookie Y Bearer — la sesión se resuelve desde cualquiera de los dos
    // (MID-06: `userId` derivado de la sesión, nunca una constante fija).
    for (const auth of [
      { Cookie: cookie },
      { Authorization: `Bearer ${token}` },
    ] as Array<Record<string, string>>) {
      const res = await request(app)
        .get(`/api/ingresos/mes?periodo=${CURRENT_PERIODO}`)
        .set('x-api-key', API_KEY)
        .set(auth)
        .expect(200);

      // Match EXACTO sobre el estado conocido de A (CA-08): descarta tanto
      // leak-in como leak-replace.
      expect(res.body.total).toBe('300000');
      expect(res.body.conteo).toBe(3);
      expect(
        res.body.transacciones.map((t: { monto: string }) => t.monto),
      ).toEqual(['150000', '100000', '50000']);
      expect(
        res.body.transacciones.map((t: { origen: string }) => t.origen),
      ).toEqual(['TestBank', 'TestBank', 'TestBank']);

      // Nada del alien B en el wire: ni montos, ni banco, ni ids.
      const bodySerializado = JSON.stringify(res.body);
      expect(bodySerializado).not.toContain(alienUserId);
      expect(bodySerializado).not.toContain('5000000');
      expect(bodySerializado).not.toContain('BancoAlien');
      expect(bodySerializado).not.toContain('alien');
    }
  });

  // ── MID-05: reconciliación con resumen-mensual, SPEND excluida ─────────

  it('reconciliación — `total` === resumen Ingreso `totalAbono`; la SPEND row (abono>0 && cargo>0) queda fuera de ambos (MID-05)', async () => {
    if (!ALLOW) return;
    const password = 'rec-password-123';
    const { userId } = await seedUserWithCredentials('rec', password);
    const accountId = await seedAccount(userId, 'rec');
    const ingestaId = await seedIngesta(accountId, 'rec', userId);
    const comidaId = await seedCategoria(
      userId,
      'comida',
      BUCKET_IDS[Bucket.Necesidades],
    );

    await seedIngreso({
      accountId,
      ingestaId,
      abono: 1_500_000n,
      descripcion: `Ingreso rec ${RUN_ID}`,
      dia: 2,
    });
    await seedIngreso({
      accountId,
      ingestaId,
      abono: 500_000n,
      descripcion: `Freelance rec ${RUN_ID}`,
      dia: 8,
    });
    // SPEND row — abono>0 && cargo>0 en Necesidades (nunca bucket-ingreso).
    await seedSpend({
      accountId,
      ingestaId,
      categoriaId: comidaId,
      cargo: 80_000n,
      abono: 100_000n,
      descripcion: `Gasto rec ${RUN_ID}`,
      dia: 4,
    });

    const { cookie } = await loginCookie(userId, password);

    const ingresosRes = await request(app)
      .get(`/api/ingresos/mes?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);
    const resumenRes = await request(app)
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    // Reconciliación: ambos ven el MISMO total de ingresos (Σ abono de
    // bucket-ingreso) — el abono de la SPEND row no infla ninguno.
    expect(ingresosRes.body.total).toBe('2000000');
    expect(ingresosRes.body.conteo).toBe(2);
    expect(resumenRes.body.totalIngreso).toBe('2000000');
    expect(ingresosRes.body.total).toBe(resumenRes.body.totalIngreso);

    // La SPEND row está categorizada como GASTO (cargo 80 000 en
    // Necesidades), NO como ingreso — excluida de ambos.
    const necesidades = resumenRes.body.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Necesidades',
    );
    expect(necesidades.total).toBe('80000');
    expect(JSON.stringify(ingresosRes.body)).not.toContain(
      `Gasto rec ${RUN_ID}`,
    );
  });
});
