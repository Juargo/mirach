/**
 * perfil-presupuesto.e2e-spec.ts — issue #110 (PER-03..PER-06, ADR-005 §7).
 *
 * The two acceptance scenarios of the issue, through the public HTTP API:
 *   - changing to "Salir de deudas" (80/10/10) recalculates every month;
 *   - a custom profile that does not sum 100% is rejected with
 *     PERFIL_NO_SUMA_100 and the profile does not change.
 * Plus isolation (ADR-010 §7): a user's PUT never touches another user, and
 * the summaries of user B keep 50/30/20.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createTestContainer } from './support/test-container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { crearSesionParaUsuario } from './support/session.fixture';
import { perfilPresupuestoResponseSchema } from '../src/infrastructure/http-express/schemas/perfil-presupuesto.schema';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `perfil-presupuesto-e2e-${Date.now()}`;

interface BucketBody {
  bucket: string;
  metaBp: number;
  estado: string | null;
}

describe('GET/PUT /api/perfil/presupuesto (e2e, #110)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const marcela = `${RUN_ID}-marcela`;
  const otro = `${RUN_ID}-otro`;
  let authMarcela: string;
  let authOtro: string;
  // Same key as the container: the bucket detail reader decrypts descripcion.
  let crypto: AesGcmCryptoService;

  async function seedMes(userId: string, suffix: string, fecha: Date) {
    const accountId = `${RUN_ID}-acc-${suffix}`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`ACC-${suffix}`),
      },
    });
    const ingestaId = `${RUN_ID}-ing-${suffix}`;
    await prisma.ingesta.create({
      data: {
        id: ingestaId,
        userId,
        accountId,
        banco: 'TestBank',
        nombreArchivo: `test-${suffix}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    const filas: Array<[string, bigint, bigint]> = [
      [BUCKET_IDS[Bucket.Ingreso], 0n, 1_000_000n],
      [BUCKET_IDS[Bucket.Necesidades], 750_000n, 0n],
      [BUCKET_IDS[Bucket.Deseos], 100_000n, 0n],
      [BUCKET_IDS[Bucket.Ahorro], 150_000n, 0n],
    ];
    for (const [bucketId, cargo, abono] of filas) {
      await prisma.transaccion.create({
        data: {
          accountId,
          ingestaId,
          bucketId,
          cargo,
          abono,
          fecha,
          descripcion: crypto.encrypt('E2E perfil presupuesto'),
        },
      });
    }
  }

  const get = (path: string, auth: string) =>
    request(app).get(path).set('x-api-key', API_KEY).set('Authorization', auth);
  const put = (body: unknown, auth: string) =>
    request(app)
      .put('/api/perfil/presupuesto')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send(body as object);

  beforeAll(async () => {
    const env = loadEnv();
    crypto = new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createTestContainer(env, prisma), env);

    for (const id of [marcela, otro]) {
      await prisma.user.create({ data: { id, nombre: `E2E ${id}` } });
    }
    await seedMes(marcela, 'm-sep', new Date(Date.UTC(2026, 8, 10)));
    await seedMes(marcela, 'm-oct', new Date(Date.UTC(2026, 9, 10)));
    await seedMes(otro, 'o-oct', new Date(Date.UTC(2026, 9, 10)));
    authMarcela = `Bearer ${(await crearSesionParaUsuario(prisma, marcela)).token}`;
    authOtro = `Bearer ${(await crearSesionParaUsuario(prisma, otro)).token}`;
  });

  afterAll(async () => {
    const users = [marcela, otro];
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: users } } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('GET returns 50_30_20 for a user who never chose a profile', async () => {
    const res = await get('/api/perfil/presupuesto', authMarcela).expect(200);
    expect(() => perfilPresupuestoResponseSchema.parse(res.body)).not.toThrow();
    expect(res.body).toEqual({
      perfil: '50_30_20',
      metas: { Necesidades: 5000, Deseos: 3000, Ahorro: 2000 },
    });
  });

  it('GET requires a session (401 without one)', async () => {
    await request(app)
      .get('/api/perfil/presupuesto')
      .set('x-api-key', API_KEY)
      .expect(401);
  });

  it('requires a session (401 without one)', async () => {
    await request(app)
      .put('/api/perfil/presupuesto')
      .set('x-api-key', API_KEY)
      .send({ perfil: '80_10_10' })
      .expect(401);
  });

  it('Escenario: cambiar a "Salir de deudas" recalcula todos los meses', async () => {
    // Dado que Marcela tiene perfil 50/30/20 y movimientos en septiembre y octubre
    const antes = await get('/api/resumen?periodo=2026-10', authMarcela).expect(
      200,
    );
    expect(antes.body.targets).toEqual({
      Necesidades: 50,
      Deseos: 30,
      Ahorro: 20,
    });
    expect((antes.body.buckets as BucketBody[])[0].estado).toBe('sobre');

    // Cuando cambia su perfil a 80/10/10
    const res = await put({ perfil: '80_10_10' }, authMarcela).expect(200);
    expect(res.body).toEqual({
      perfil: '80_10_10',
      metas: { Necesidades: 8000, Deseos: 1000, Ahorro: 1000 },
    });

    // Entonces el resumen de septiembre y de octubre muestra metas 80%, 10% y 10%
    for (const periodo of ['2026-09', '2026-10']) {
      const r = await get(
        `/api/resumen?periodo=${periodo}`,
        authMarcela,
      ).expect(200);
      expect(r.body.targets).toEqual({
        Necesidades: 80,
        Deseos: 10,
        Ahorro: 10,
      });
      const buckets = r.body.buckets as BucketBody[];
      expect(buckets.map((b) => b.metaBp)).toEqual([8000, 1000, 1000]);
      expect(buckets[0].estado).toBe('bien');
    }

    const anual = await get('/api/resumen/anual?anio=2026', authMarcela).expect(
      200,
    );
    expect(anual.body.meses).toHaveLength(12);
    for (const mes of anual.body.meses as Array<{ targets: unknown }>) {
      expect(mes.targets).toEqual({ Necesidades: 80, Deseos: 10, Ahorro: 10 });
    }

    const detalle = await get(
      '/api/buckets/Necesidades/detalle?periodo=2026-09',
      authMarcela,
    ).expect(200);
    expect(detalle.body.metaBp).toBe(8000);

    const semaforo = await get(
      '/api/resumen/semaforo?periodo=2026-10',
      authMarcela,
    ).expect(200);
    expect(semaforo.body.buckets[0].metaBp).toBe(8000);
    expect(semaforo.body.buckets[0].bandas.verdeMax).toBe(8000);
  });

  it('Escenario: un perfil personalizado que no suma 100% no se guarda', async () => {
    await put({ perfil: '70_15_15' }, authMarcela).expect(200);

    // Cuando Marcela guarda 60/30/20
    const res = await put(
      {
        perfil: 'personalizado',
        metas: { Necesidades: 6000, Deseos: 3000, Ahorro: 2000 },
      },
      authMarcela,
    ).expect(400);

    // Entonces recibe 400 con código PERFIL_NO_SUMA_100 y su perfil no cambia
    expect(res.body.code).toBe('PERFIL_NO_SUMA_100');
    const despues = await get('/api/perfil/presupuesto', authMarcela).expect(
      200,
    );
    expect(despues.body.perfil).toBe('70_15_15');
  });

  it('a valid custom profile is saved (allowed for now, S6)', async () => {
    const res = await put(
      {
        perfil: 'personalizado',
        metas: { Necesidades: 5500, Deseos: 2500, Ahorro: 2000 },
      },
      authMarcela,
    ).expect(200);
    expect(res.body.metas).toEqual({
      Necesidades: 5500,
      Deseos: 2500,
      Ahorro: 2000,
    });
  });

  it('a negative goal is 400 META_INVALIDA', async () => {
    const res = await put(
      {
        perfil: 'personalizado',
        metas: { Necesidades: 11000, Deseos: -1000, Ahorro: 0 },
      },
      authMarcela,
    ).expect(400);
    expect(res.body.code).toBe('META_INVALIDA');
  });

  it.each([
    [{ perfil: '90_5_5' }],
    [
      {
        perfil: '80_10_10',
        metas: { Necesidades: 8000, Deseos: 1000, Ahorro: 1000 },
      },
    ],
    [{ perfil: 'personalizado' }],
    [
      {
        perfil: 'personalizado',
        metas: { Necesidades: 50.5, Deseos: 3000, Ahorro: 2000 },
      },
    ],
    [{ perfil: '80_10_10', userId: 'otro' }],
  ])('a malformed body %j is 400 BODY_INVALIDO', async (body) => {
    const res = await put(body, authMarcela).expect(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
  });

  it("isolation: Marcela's changes never reach another user", async () => {
    await put({ perfil: '80_10_10' }, authMarcela).expect(200);

    const perfilOtro = await get('/api/perfil/presupuesto', authOtro).expect(
      200,
    );
    expect(perfilOtro.body.perfil).toBe('50_30_20');
    const resumenOtro = await get(
      '/api/resumen?periodo=2026-10',
      authOtro,
    ).expect(200);
    expect(resumenOtro.body.targets).toEqual({
      Necesidades: 50,
      Deseos: 30,
      Ahorro: 20,
    });
  });
});
