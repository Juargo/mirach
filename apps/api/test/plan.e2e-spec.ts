/**
 * E2E tests for `GET /api/plan` (ADR-012 §2, ADR-015 §2).
 *
 * Builds the real container and app from env.
 *
 * Covered scenarios:
 *   - session required
 *   - free plan when nothing is stored
 *   - Plus from a subscription and from a grant, and the free plan again when
 *     they end, with nothing deleted (PLA-07)
 *   - one user never reads another user's plan (RNF-SEC-006)
 *   - the CHECKs of the migration reject values outside the enums
 *   - deleting the account removes its subscription and grants
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { PrismaCuentaRepository } from '../src/infrastructure/persistence/prisma-cuenta.repository';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';
import { planResponseSchema } from '../src/infrastructure/http-express/schemas/plan.schema';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `plan-e2e-${Date.now()}`;
const DIA = 24 * 60 * 60 * 1000;
const GRATIS = {
  plan: 'gratis',
  origen: null,
  venceEn: null,
  renueva: false,
  producto: null,
  tienda: null,
  prueba: null,
  fundador: null,
};

describe('GET /api/plan (e2e)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let app: Express;

  function buildApp(extra: Record<string, string | undefined>): Express {
    const env = loadEnv({ ...process.env, ...extra });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }
  let authMarcela: string;
  let authOtro: string;
  const [marcela, otro] = [`${RUN_ID}-marcela`, `${RUN_ID}-otro`];
  const usuarios = [marcela, otro];
  const cuenta = { where: { userId: { in: usuarios } } };

  const leer = async (auth: string, enApp: Express = app) => {
    const res = await request(enApp)
      .get('/api/plan')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);
    expect(res.status).toBe(200);
    return planResponseSchema.parse(res.body);
  };

  const suscribir = (userId: string, venceEn: Date, estado = 'activa') =>
    prisma.suscripcion.create({
      data: {
        userId,
        producto: 'plus_anual',
        estado,
        tienda: 'play_store',
        venceEn,
        ultimoEventoEn: new Date(),
      },
    });

  beforeAll(async () => {
    // Billing on and no trial: the plan only reflects what is stored.
    app = buildApp({
      PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
      PLUS_TRIAL_DAYS: '0',
    });
    prisma = prismas[0];
    for (const id of usuarios) {
      await prisma.user.create({ data: { id, nombre: id } });
    }
    authMarcela = `Bearer ${(await crearSesionParaUsuario(prisma, marcela)).token}`;
    authOtro = `Bearer ${(await crearSesionParaUsuario(prisma, otro)).token}`;
  });

  beforeEach(async () => {
    await prisma.suscripcion.deleteMany(cuenta);
    await prisma.permisoPlan.deleteMany(cuenta);
  });

  afterAll(async () => {
    await prisma.suscripcion.deleteMany(cuenta);
    await prisma.permisoPlan.deleteMany(cuenta);
    await prisma.session.deleteMany(cuenta);
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  it('401 without a session', async () => {
    const res = await request(app).get('/api/plan').set('x-api-key', API_KEY);

    expect(res.status).toBe(401);
  });

  it('is the free plan when nothing is stored', async () => {
    expect(await leer(authMarcela)).toEqual(GRATIS);
  });

  it('is Plus with a subscription in force', async () => {
    const venceEn = new Date(Date.now() + 30 * DIA);
    await suscribir(marcela, venceEn);

    expect(await leer(authMarcela)).toEqual({
      plan: 'plus',
      origen: 'suscripcion',
      venceEn: venceEn.toISOString(),
      renueva: true,
      producto: 'plus_anual',
      tienda: 'play_store',
      prueba: null,
      fundador: null,
    });
  });

  it('is the free plan again when the subscription ends, and the row stays', async () => {
    await suscribir(marcela, new Date(Date.now() - DIA), 'vencida');

    expect(await leer(authMarcela)).toEqual(GRATIS);
    expect(await prisma.suscripcion.count(cuenta)).toBe(1);
  });

  it('is Plus without an end date with a lifetime grant', async () => {
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'tester_vitalicio' },
    });

    expect(await leer(authMarcela)).toEqual({
      plan: 'plus',
      origen: 'tester_vitalicio',
      venceEn: null,
      renueva: false,
      producto: null,
      tienda: null,
      prueba: null,
      fundador: null,
    });
  });

  it('is the free plan with a revoked grant', async () => {
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'fundador', revocadoEn: new Date() },
    });

    expect(await leer(authMarcela)).toEqual(GRATIS);
  });

  it('is the free plan with an expired stored trial, and says the trial ended', async () => {
    const venceEn = new Date(Date.now() - DIA);
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'prueba', venceEn },
    });

    expect(await leer(authMarcela)).toEqual({
      ...GRATIS,
      prueba: {
        venceEn: venceEn.toISOString(),
        vigente: false,
        avisoDiasRestantes: null,
      },
    });
  });

  describe('billing switch and trial (ADR-015 §3)', () => {
    it('every account has Plus while billing is not turned on', async () => {
      const lanzamiento = buildApp({
        PLUS_BILLING_STARTS_AT: undefined,
        PLUS_TRIAL_DAYS: '30',
      });

      expect(await leer(authMarcela, lanzamiento)).toEqual({
        ...GRATIS,
        plan: 'plus',
        origen: 'lanzamiento',
      });
    });

    it('an account that already existed gets its trial from the day billing starts', async () => {
      const inicio = new Date(Date.now() - 2 * DIA);
      const conPrueba = buildApp({
        PLUS_BILLING_STARTS_AT: inicio.toISOString(),
        PLUS_TRIAL_DAYS: '30',
      });
      await prisma.user.update({
        where: { id: marcela },
        data: { creadoEn: new Date(Date.now() - 200 * DIA) },
      });
      const venceEn = new Date(inicio.getTime() + 30 * DIA).toISOString();

      expect(await leer(authMarcela, conPrueba)).toEqual({
        ...GRATIS,
        plan: 'plus',
        origen: 'prueba',
        venceEn,
        prueba: { venceEn, vigente: true, avisoDiasRestantes: null },
      });
    });

    it('a new account gets its trial from its creation, with the notice in the last days', async () => {
      const conPrueba = buildApp({
        PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
        PLUS_TRIAL_DAYS: '30',
      });
      const creadoEn = new Date(Date.now() - 28.5 * DIA);
      await prisma.user.update({ where: { id: marcela }, data: { creadoEn } });
      const venceEn = new Date(creadoEn.getTime() + 30 * DIA).toISOString();

      expect(await leer(authMarcela, conPrueba)).toMatchObject({
        plan: 'plus',
        origen: 'prueba',
        prueba: { venceEn, vigente: true, avisoDiasRestantes: 2 },
      });
    });

    it('after the trial the account is on the free plan and keeps everything', async () => {
      const conPrueba = buildApp({
        PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
        PLUS_TRIAL_DAYS: '30',
      });
      const creadoEn = new Date(Date.now() - 31 * DIA);
      await prisma.user.update({ where: { id: marcela }, data: { creadoEn } });

      expect(await leer(authMarcela, conPrueba)).toEqual({
        ...GRATIS,
        prueba: {
          venceEn: new Date(creadoEn.getTime() + 30 * DIA).toISOString(),
          vigente: false,
          avisoDiasRestantes: null,
        },
      });
      expect(await prisma.user.count({ where: { id: marcela } })).toBe(1);
    });
  });

  describe('Fundador seats (PLA-10)', () => {
    it('counts the grants in force of every account, without sandbox or revoked ones', async () => {
      const enVenta = buildApp({
        PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
        PLUS_TRIAL_DAYS: '0',
        REVENUECAT_FUNDADOR_PRODUCT_ID: 'plus_fundador',
        FUNDADOR_SEATS: '1000000',
      });
      const antes = (await leer(authMarcela, enVenta)).fundador;
      const extras = [1, 2].map((n) => `${RUN_ID}-fundador-${n}`);
      for (const id of extras) {
        await prisma.user.create({ data: { id, nombre: id } });
      }
      await prisma.permisoPlan.createMany({
        data: [
          { userId: otro, motivo: 'fundador' },
          { userId: marcela, motivo: 'fundador', sandbox: true },
          { userId: extras[0], motivo: 'fundador', revocadoEn: new Date() },
          { userId: extras[1], motivo: 'tester_vitalicio' },
        ],
      });

      const despues = (await leer(authMarcela, enVenta)).fundador;
      await prisma.permisoPlan.deleteMany({
        where: { userId: { in: extras } },
      });
      await prisma.user.deleteMany({ where: { id: { in: extras } } });

      expect(antes?.cuposTotales).toBe(1000000);
      expect(despues).toEqual({
        cuposTotales: 1000000,
        cuposDisponibles: (antes?.cuposDisponibles ?? 0) - 1,
      });
    });

    it('never answers a negative number of seats', async () => {
      const agotado = buildApp({
        REVENUECAT_FUNDADOR_PRODUCT_ID: 'plus_fundador',
        FUNDADOR_SEATS: '0',
      });
      await prisma.permisoPlan.create({
        data: { userId: otro, motivo: 'fundador' },
      });

      expect((await leer(authMarcela, agotado)).fundador).toEqual({
        cuposTotales: 0,
        cuposDisponibles: 0,
      });
    });
  });

  it("never answers with another user's plan (RNF-SEC-006)", async () => {
    await suscribir(marcela, new Date(Date.now() + 30 * DIA));
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'fundador' },
    });

    expect(await leer(authOtro)).toEqual(GRATIS);
    expect((await leer(authMarcela)).origen).toBe('fundador');
  });

  it('allows one grant per user and reason', async () => {
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'prueba' },
    });

    await expect(
      prisma.permisoPlan.create({
        data: { userId: marcela, motivo: 'prueba' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects values outside the enums (CHECK)', async () => {
    await expect(
      prisma.permisoPlan.create({
        data: { userId: marcela, motivo: 'regalo' },
      }),
    ).rejects.toThrow();
    await expect(
      suscribir(marcela, new Date(Date.now() + DIA), 'prueba'),
    ).rejects.toThrow();
  });

  it('deleting the account removes its subscription and grants only', async () => {
    const borrable = `${RUN_ID}-borrable`;
    await prisma.user.create({ data: { id: borrable, nombre: borrable } });
    await suscribir(borrable, new Date(Date.now() + DIA));
    await prisma.permisoPlan.create({
      data: { userId: borrable, motivo: 'prueba' },
    });
    await suscribir(marcela, new Date(Date.now() + DIA));

    await new PrismaCuentaRepository(prisma).eliminar(borrable);

    expect(await prisma.user.count({ where: { id: borrable } })).toBe(0);
    expect(
      await prisma.suscripcion.count({ where: { userId: borrable } }),
    ).toBe(0);
    expect(
      await prisma.permisoPlan.count({ where: { userId: borrable } }),
    ).toBe(0);
    expect(await prisma.suscripcion.count(cuenta)).toBe(1);
  });
});
