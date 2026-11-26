/**
 * E2E tests for the free plan limits (PLA-01, CLA-09, ADR-015).
 *
 * Builds the real container and app from env: one with billing on and no
 * trial (an account without a stored entitlement is on the free plan), one
 * with billing off (every account has Plus, the launch period).
 *
 * Covered scenarios:
 *   - free plan: creating, editing and deleting categories and patterns is
 *     403 PLAN_PLUS_REQUERIDO and writes nothing; reading the catalog and
 *     reclassifying a movement stay open
 *   - free plan: a custom budget profile is 403; a predefined one is not; a
 *     custom profile kept from Plus stays, but its goals cannot change
 *   - Plus: all of it works
 *   - billing off: nothing is limited
 *   - nothing of the account is deleted or changed when it stops having Plus
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { copiarCatalogoTemplate } from '../src/infrastructure/persistence/catalogo-template';
import { crearSesionParaUsuario } from './support/session.fixture';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `limites-e2e-${Date.now()}`;
const PLUS_REQUERIDO = {
  code: 'PLAN_PLUS_REQUERIDO',
  message: 'Esta función es parte de Mirach Plus.',
};
const PROPIO = {
  perfil: 'personalizado',
  metas: { Necesidades: 6000, Deseos: 2500, Ahorro: 1500 },
};

describe('free plan limits (e2e)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let conCobro: Express;
  let lanzamiento: Express;
  const user = `${RUN_ID}-marcela`;
  const cuenta = { where: { userId: user } };
  let auth: string;

  function buildApp(extra: Record<string, string | undefined>): Express {
    const env = loadEnv({ ...process.env, ...extra });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }

  const llamar = (
    metodo: 'get' | 'post' | 'patch' | 'put' | 'delete',
    ruta: string,
    app: Express = conCobro,
  ) =>
    request(app)
      [metodo](ruta)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);

  const darPlus = () =>
    prisma.permisoPlan.create({
      data: { userId: user, motivo: 'tester_vitalicio' },
    });
  const quitarPlus = () => prisma.permisoPlan.deleteMany(cuenta);

  const propia = async () => {
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { userId: user, esInterna: false },
      orderBy: { nombre: 'asc' },
    });
    const patron = await prisma.patronClasificacion.findFirstOrThrow({
      where: { userId: user },
      orderBy: { id: 'asc' },
    });
    return { categoria, patron };
  };
  const contar = async () => ({
    categorias: await prisma.categoria.count(cuenta),
    patrones: await prisma.patronClasificacion.count(cuenta),
  });

  beforeAll(async () => {
    conCobro = buildApp({
      PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
      PLUS_TRIAL_DAYS: '0',
    });
    lanzamiento = buildApp({ PLUS_BILLING_STARTS_AT: undefined });
    prisma = prismas[0];
    await prisma.user.create({ data: { id: user, nombre: user } });
    await copiarCatalogoTemplate(prisma, user);
    auth = `Bearer ${(await crearSesionParaUsuario(prisma, user)).token}`;
  });

  beforeEach(quitarPlus);

  afterAll(async () => {
    await prisma.permisoPlan.deleteMany(cuenta);
    await prisma.session.deleteMany(cuenta);
    await prisma.transaccion.deleteMany({
      where: { account: { userId: user } },
    });
    await prisma.account.deleteMany(cuenta);
    await prisma.patronClasificacion.deleteMany(cuenta);
    await prisma.categoria.deleteMany(cuenta);
    await prisma.user.deleteMany({ where: { id: user } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  describe('categories and patterns (CLA-09)', () => {
    it('the free plan cannot create, edit or delete them, and nothing is written', async () => {
      const { categoria, patron } = await propia();
      const antes = await contar();

      const respuestas = await Promise.all([
        llamar('post', '/api/categorias').send({
          nombre: `${RUN_ID} nueva`,
          bucket: 'Deseos',
        }),
        llamar('patch', `/api/categorias/${categoria.id}`).send({
          nombre: `${RUN_ID} renombrada`,
        }),
        llamar('delete', `/api/categorias/${categoria.id}`),
        llamar('post', '/api/patrones').send({
          categoriaId: categoria.id,
          patron: `${RUN_ID} patron`,
          matchType: 'CONTAINS',
        }),
        llamar('post', '/api/patrones/vista-previa').send({
          categoriaId: categoria.id,
          patron: `${RUN_ID} patron`,
          matchType: 'CONTAINS',
        }),
        llamar('patch', `/api/patrones/${patron.id}`).send({ prioridad: 5 }),
        llamar('delete', `/api/patrones/${patron.id}`),
      ]);

      for (const res of respuestas) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual(PLUS_REQUERIDO);
      }
      expect(await contar()).toEqual(antes);
      expect(
        await prisma.categoria.findUnique({ where: { id: categoria.id } }),
      ).toEqual(categoria);
      expect(
        await prisma.patronClasificacion.findUnique({
          where: { id: patron.id },
        }),
      ).toEqual(patron);
    });

    it('the free plan still reads the whole catalog', async () => {
      const res = await llamar('get', '/api/categorias');

      expect(res.status).toBe(200);
      expect(res.body.categorias.length).toBe((await contar()).categorias);
    });

    it('the free plan still registers a movement and reclassifies it', async () => {
      const [categoria, otra] = await prisma.categoria.findMany({
        where: { userId: user, esInterna: false, bucket: { nombre: 'Deseos' } },
        orderBy: { nombre: 'asc' },
        take: 2,
      });
      expect(otra).toBeDefined();

      const creado = await llamar('post', '/api/movimientos').send({
        tipo: 'Gasto',
        fecha: new Date().toISOString().slice(0, 10),
        descripcion: `${RUN_ID} compra`,
        monto: '1500',
        bucket: 'Deseos',
        categoriaId: categoria.id,
      });
      expect(creado.status).toBe(201);
      const transaccion = await prisma.transaccion.findFirstOrThrow({
        where: { account: { userId: user } },
      });

      const res = await llamar(
        'patch',
        `/api/transacciones/${transaccion.id}/categoria`,
      ).send({ categoriaId: otra.id });

      expect(res.status).toBe(200);
      expect(
        (
          await prisma.transaccion.findUniqueOrThrow({
            where: { id: transaccion.id },
          })
        ).categoriaId,
      ).toBe(otra.id);
    });

    it('Plus creates a category', async () => {
      await darPlus();

      const res = await llamar('post', '/api/categorias').send({
        nombre: `${RUN_ID} con plus`,
        bucket: 'Deseos',
      });

      expect(res.status).toBe(201);
    });

    it('what was created on Plus stays when Plus ends', async () => {
      const creada = await prisma.categoria.findFirstOrThrow({
        where: { userId: user, nombre: `${RUN_ID} con plus` },
      });

      const res = await llamar('get', '/api/categorias');

      expect(res.status).toBe(200);
      expect(
        (res.body.categorias as Array<{ id: string }>).map((c) => c.id),
      ).toContain(creada.id);
    });

    it('nothing is limited while billing is off', async () => {
      const res = await llamar('post', '/api/categorias', lanzamiento).send({
        nombre: `${RUN_ID} lanzamiento`,
        bucket: 'Deseos',
      });

      expect(res.status).toBe(201);
    });
  });

  describe('budget profile (PLA-01)', () => {
    const perfilGuardado = () =>
      prisma.user.findUniqueOrThrow({
        where: { id: user },
        select: {
          perfilPresupuesto: true,
          metaNecesidadesBp: true,
          metaDeseosBp: true,
          metaAhorroBp: true,
          diaCorte: true,
        },
      });

    it('the free plan cannot set a custom profile, and the stored one does not change', async () => {
      const antes = await perfilGuardado();

      const res = await llamar('put', '/api/perfil/presupuesto').send(PROPIO);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PLUS_REQUERIDO);
      expect(await perfilGuardado()).toEqual(antes);
    });

    it('the free plan chooses a predefined profile', async () => {
      const res = await llamar('put', '/api/perfil/presupuesto').send({
        perfil: '65_20_15',
      });

      expect(res.status).toBe(200);
      expect((await perfilGuardado()).perfilPresupuesto).toBe('65_20_15');
    });

    it('Plus sets a custom profile; without Plus it stays, its cut-off day can change, its goals cannot', async () => {
      await darPlus();
      expect(
        (await llamar('put', '/api/perfil/presupuesto').send(PROPIO)).status,
      ).toBe(200);
      await quitarPlus();

      const leido = await llamar('get', '/api/perfil/presupuesto');
      expect(leido.body).toMatchObject(PROPIO);

      const mismoPerfil = await llamar('put', '/api/perfil/presupuesto').send({
        ...PROPIO,
        diaCorte: 15,
      });
      expect(mismoPerfil.status).toBe(200);
      expect(await perfilGuardado()).toMatchObject({
        perfilPresupuesto: 'personalizado',
        metaNecesidadesBp: 6000,
        diaCorte: 15,
      });

      const otrasMetas = await llamar('put', '/api/perfil/presupuesto').send({
        perfil: 'personalizado',
        metas: { Necesidades: 5000, Deseos: 2500, Ahorro: 2500 },
      });
      expect(otrasMetas.status).toBe(403);
      expect(otrasMetas.body).toEqual(PLUS_REQUERIDO);
      expect((await perfilGuardado()).metaNecesidadesBp).toBe(6000);
    });

    it('an invalid custom profile is 400 on the free plan too, never a hint to pay', async () => {
      const res = await llamar('put', '/api/perfil/presupuesto').send({
        perfil: 'personalizado',
        metas: { Necesidades: 6000, Deseos: 2500, Ahorro: 1000 },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PERFIL_NO_SUMA_100');
    });
  });
});
