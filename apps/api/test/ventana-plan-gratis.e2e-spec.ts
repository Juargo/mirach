/**
 * E2E tests for the free plan window of visible months (S14, PLA-01, ADR-015).
 *
 * Builds the real container and app from env: one with billing on and no
 * trial (an account without a stored entitlement is on the free plan), one
 * with billing off (every account has Plus, the launch period). A free
 * account sees its anchor month (the latest month with movements) and the two
 * months before it; what is older stays stored and is hidden.
 *
 * Covered scenarios:
 *   - free plan: each monthly read answers 403 PLAN_PLUS_REQUERIDO for a month
 *     before the window and as always for the first month of the window, the
 *     anchor, a month after it and an absent `periodo`
 *   - free plan: GET /api/periodos lists the window only; GET
 *     /api/resumen/anual hides the months before it, or is 403 when all are
 *   - free plan: the period of the reclassification helpers and the date of a
 *     hand-registered movement before the window are 403 and write nothing
 *   - financial months follow the cut-off day; an account without movements
 *     anchors on the current month; one account never sees another's window
 *   - Plus and billing off: every route answers as before the window existed
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
const RUN_ID = `ventana-e2e-${Date.now()}`;
const PLUS_REQUERIDO = {
  code: 'PLAN_PLUS_REQUERIDO',
  message: 'Esta función es parte de Mirach Plus.',
};

// Anchor 2026-06, window 2026-04..2026-06; 2026-03 and 2026-01 are hidden.
const MESES_CON_DATOS = ['2026-01', '2026-03', '2026-04', '2026-05', '2026-06'];
const LECTURAS_MENSUALES = [
  '/api/resumen',
  '/api/resumen/semaforo',
  '/api/buckets/Deseos',
  '/api/buckets/Deseos/detalle',
  '/api/movimientos',
  '/api/ingresos/mes',
];

type Metodo = 'get' | 'post' | 'patch' | 'put';

describe('free plan window of visible months (e2e)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let conCobro: Express;
  let lanzamiento: Express;
  const usuarios = {
    gratis: `${RUN_ID}-gratis`,
    sinDatos: `${RUN_ID}-sin-datos`,
    corte: `${RUN_ID}-corte`,
    antiguo: `${RUN_ID}-antiguo`,
  };
  const auth: Record<string, string> = {};
  let categoriaId: string;
  let otraCategoriaId: string;

  function buildApp(extra: Record<string, string | undefined>): Express {
    const env = loadEnv({ ...process.env, ...extra });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }

  const llamar = (
    metodo: Metodo,
    ruta: string,
    usuario: string,
    app: Express = conCobro,
  ) =>
    request(app)
      [metodo](ruta)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth[usuario]);

  const darPlus = (userId: string) =>
    prisma.permisoPlan.create({
      data: { userId, motivo: 'tester_vitalicio' },
    });
  const quitarPlus = (userId: string) =>
    prisma.permisoPlan.deleteMany({ where: { userId } });

  /** Registers a movement through the API, so the account needs Plus. */
  async function registrar(
    userId: string,
    fecha: string,
    tipo: 'Ingreso' | 'Gasto',
    descripcion = `${RUN_ID} ${tipo} ${fecha}`,
  ): Promise<void> {
    const res = await llamar('post', '/api/movimientos', userId).send({
      tipo,
      fecha,
      descripcion,
      monto: '10000',
      ...(tipo === 'Gasto' ? { bucket: 'Deseos', categoriaId } : {}),
    });
    expect(res.status).toBe(201);
  }

  async function sembrar(
    userId: string,
    fechas: string[],
    corte?: number,
  ): Promise<void> {
    await darPlus(userId);
    if (corte !== undefined) {
      await llamar('put', '/api/perfil/presupuesto', userId)
        .send({ perfil: '50_30_20', diaCorte: corte })
        .expect(200);
    }
    for (const fecha of fechas) {
      await registrar(userId, fecha, 'Ingreso');
    }
    await quitarPlus(userId);
  }

  const contarTransacciones = (userId: string) =>
    prisma.transaccion.count({ where: { account: { userId } } });

  beforeAll(async () => {
    conCobro = buildApp({
      PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
      PLUS_TRIAL_DAYS: '0',
      FREE_PLAN_VISIBLE_MONTHS: '3',
    });
    lanzamiento = buildApp({
      PLUS_BILLING_STARTS_AT: undefined,
      FREE_PLAN_VISIBLE_MONTHS: '3',
    });
    prisma = prismas[0];
    for (const id of Object.values(usuarios)) {
      await prisma.user.create({ data: { id, nombre: id } });
      await copiarCatalogoTemplate(prisma, id);
      auth[id] = `Bearer ${(await crearSesionParaUsuario(prisma, id)).token}`;
    }
    const categorias = await prisma.categoria.findMany({
      where: {
        userId: usuarios.gratis,
        esInterna: false,
        bucket: { nombre: 'Deseos' },
      },
      orderBy: { nombre: 'asc' },
      take: 2,
    });
    categoriaId = categorias[0].id;
    otraCategoriaId = categorias[1].id;

    await sembrar(
      usuarios.gratis,
      MESES_CON_DATOS.map((m) => `${m}-10`),
    );
    await darPlus(usuarios.gratis);
    await registrar(usuarios.gratis, '2026-03-12', 'Gasto', `${RUN_ID} marzo`);
    await registrar(usuarios.gratis, '2026-06-12', 'Gasto', `${RUN_ID} junio`);
    await quitarPlus(usuarios.gratis);
    // 25 Jun 2026 starts period 2026-06 with cut-off 25.
    await sembrar(usuarios.corte, ['2026-06-26'], 25);
    await sembrar(usuarios.antiguo, ['2025-01-10']);
  });

  afterAll(async () => {
    const ids = Object.values(usuarios);
    await prisma.permisoPlan.deleteMany({ where: { userId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: ids } } },
    });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.categoria.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  afterEach(async () => {
    for (const id of Object.values(usuarios)) await quitarPlus(id);
  });

  describe('monthly reads (free plan)', () => {
    it.each(LECTURAS_MENSUALES)(
      '%s: a month before the window is 403 PLAN_PLUS_REQUERIDO',
      async (ruta) => {
        for (const periodo of ['2026-03', '2026-01', '2025-06']) {
          const res = await llamar(
            'get',
            `${ruta}?periodo=${periodo}`,
            usuarios.gratis,
          );

          expect(res.status).toBe(403);
          expect(res.body).toEqual(PLUS_REQUERIDO);
        }
      },
    );

    it.each(LECTURAS_MENSUALES)(
      '%s: the window, a month after the anchor and an absent periodo answer as always',
      async (ruta) => {
        for (const periodo of ['2026-04', '2026-05', '2026-06', '2026-09']) {
          const res = await llamar(
            'get',
            `${ruta}?periodo=${periodo}`,
            usuarios.gratis,
          );
          expect(res.status).toBe(200);
        }
        expect((await llamar('get', ruta, usuarios.gratis)).status).toBe(200);
      },
    );

    it('an absent periodo resolves to the anchor month, not to the current one', async () => {
      const res = await llamar('get', '/api/movimientos', usuarios.gratis);

      expect(res.status).toBe(200);
      expect(res.body.periodo).toBe('2026-06');
    });

    it('an invalid periodo is still 400, not 403', async () => {
      for (const periodo of ['2026-13', 'abc', '']) {
        const res = await llamar(
          'get',
          `/api/resumen?periodo=${periodo}`,
          usuarios.gratis,
        );

        expect(res.status).toBe(400);
      }
    });

    it('the hidden data stays stored', async () => {
      const antes = await contarTransacciones(usuarios.gratis);

      await llamar('get', '/api/movimientos?periodo=2026-03', usuarios.gratis);

      expect(antes).toBe(MESES_CON_DATOS.length + 2);
      expect(await contarTransacciones(usuarios.gratis)).toBe(antes);
    });
  });

  describe('monthly reads (Plus and billing off answer as before)', () => {
    it.each(LECTURAS_MENSUALES)(
      '%s: Plus reads a hidden month',
      async (ruta) => {
        await darPlus(usuarios.gratis);

        for (const periodo of ['2026-03', '2026-01', '2025-06']) {
          const res = await llamar(
            'get',
            `${ruta}?periodo=${periodo}`,
            usuarios.gratis,
          );
          expect(res.status).toBe(200);
        }
      },
    );

    it('Plus gets the movements of a hidden month, complete', async () => {
      await darPlus(usuarios.gratis);

      const res = await llamar(
        'get',
        '/api/movimientos?periodo=2026-03',
        usuarios.gratis,
      );

      expect(res.body.periodo).toBe('2026-03');
      expect(res.body.totalTransacciones).toBe(2);
    });

    it.each(LECTURAS_MENSUALES)(
      '%s: while billing is off nothing is hidden',
      async (ruta) => {
        const res = await llamar(
          'get',
          `${ruta}?periodo=2026-03`,
          usuarios.gratis,
          lanzamiento,
        );

        expect(res.status).toBe(200);
      },
    );
  });

  describe('GET /api/periodos', () => {
    it('the free plan lists only the months inside the window', async () => {
      const res = await llamar('get', '/api/periodos', usuarios.gratis);

      expect(res.status).toBe(200);
      expect(res.body.periodos).toEqual(['2026-06', '2026-05', '2026-04']);
      expect(
        res.body.rangos.map((r: { periodo: string }) => r.periodo),
      ).toEqual(['2026-06', '2026-05', '2026-04']);
    });

    it('Plus lists every month with movements', async () => {
      await darPlus(usuarios.gratis);

      const res = await llamar('get', '/api/periodos', usuarios.gratis);

      expect(res.body.periodos).toEqual([
        '2026-06',
        '2026-05',
        '2026-04',
        '2026-03',
        '2026-01',
      ]);
    });

    it('billing off lists every month with movements', async () => {
      const res = await llamar(
        'get',
        '/api/periodos',
        usuarios.gratis,
        lanzamiento,
      );

      expect(res.body.periodos).toHaveLength(5);
    });
  });

  describe('GET /api/resumen/anual', () => {
    it('the free plan reports a month before the window like a month without movements', async () => {
      const res = await llamar(
        'get',
        '/api/resumen/anual?anio=2026',
        usuarios.gratis,
      );

      expect(res.status).toBe(200);
      const meses = res.body.meses as Array<{
        periodo: string;
        totalIngreso: string;
        sinIngreso: boolean;
      }>;
      expect(meses).toHaveLength(12);
      // 2026-01 and 2026-03 have income stored, yet are reported empty.
      expect(meses.slice(0, 3).map((m) => m.sinIngreso)).toEqual([
        true,
        true,
        true,
      ]);
      expect(meses[0].totalIngreso).toBe(meses[1].totalIngreso);
      expect(meses.slice(3, 6).map((m) => m.sinIngreso)).toEqual([
        false,
        false,
        false,
      ]);
    });

    it('a year with every month before the window is 403', async () => {
      const res = await llamar(
        'get',
        '/api/resumen/anual?anio=2025',
        usuarios.gratis,
      );

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PLUS_REQUERIDO);
    });

    it('an invalid year is still 400', async () => {
      const res = await llamar(
        'get',
        '/api/resumen/anual?anio=abc',
        usuarios.gratis,
      );

      expect(res.status).toBe(400);
    });

    it('Plus gets the whole year, and a year before the window', async () => {
      await darPlus(usuarios.gratis);

      const anual = await llamar(
        'get',
        '/api/resumen/anual?anio=2026',
        usuarios.gratis,
      );
      const anterior = await llamar(
        'get',
        '/api/resumen/anual?anio=2025',
        usuarios.gratis,
      );

      expect(
        anual.body.meses.filter((m: { sinIngreso: boolean }) => !m.sinIngreso),
      ).toHaveLength(5);
      expect(anterior.status).toBe(200);
    });

    it('billing off gets the whole year', async () => {
      const res = await llamar(
        'get',
        '/api/resumen/anual?anio=2026',
        usuarios.gratis,
        lanzamiento,
      );

      expect(
        res.body.meses.filter((m: { sinIngreso: boolean }) => !m.sinIngreso),
      ).toHaveLength(5);
    });
  });

  describe('reclassification helpers', () => {
    const movimiento = (descripcion: string) =>
      prisma.transaccion
        .findMany({ where: { account: { userId: usuarios.gratis } } })
        .then(async (filas) => {
          // Descriptions are encrypted at rest: tell them apart by the month.
          const fecha = descripcion === 'marzo' ? '2026-03-12' : '2026-06-12';
          return filas.find(
            (t) => t.fecha.toISOString().slice(0, 10) === fecha,
          )!;
        });

    it('parecidos with a period before the window is 403; inside it answers', async () => {
      const junio = await movimiento('junio');
      const ruta = `/api/transacciones/${junio.id}/parecidos?categoriaId=${otraCategoriaId}`;

      const oculto = await llamar(
        'get',
        `${ruta}&periodo=2026-03`,
        usuarios.gratis,
      );
      const visible = await llamar(
        'get',
        `${ruta}&periodo=2026-06`,
        usuarios.gratis,
      );
      const ausente = await llamar('get', ruta, usuarios.gratis);

      expect(oculto.status).toBe(403);
      expect(oculto.body).toEqual(PLUS_REQUERIDO);
      expect(visible.status).toBe(200);
      expect(ausente.status).toBe(200);
    });

    it('Plus asks parecidos of a hidden month', async () => {
      await darPlus(usuarios.gratis);
      const junio = await movimiento('junio');

      const res = await llamar(
        'get',
        `/api/transacciones/${junio.id}/parecidos?categoriaId=${otraCategoriaId}&periodo=2026-03`,
        usuarios.gratis,
      );

      expect(res.status).toBe(200);
    });

    it('aplicarAParecidos with a period before the window is 403 and changes nothing', async () => {
      const junio = await movimiento('junio');
      const patrones = await prisma.patronClasificacion.count({
        where: { userId: usuarios.gratis },
      });

      const res = await llamar(
        'patch',
        `/api/transacciones/${junio.id}/categoria`,
        usuarios.gratis,
      ).send({
        categoriaId: otraCategoriaId,
        aplicarAParecidos: { periodo: '2026-03' },
      });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PLUS_REQUERIDO);
      expect(
        (
          await prisma.transaccion.findUniqueOrThrow({
            where: { id: junio.id },
          })
        ).categoriaId,
      ).toBe(junio.categoriaId);
      expect(
        await prisma.patronClasificacion.count({
          where: { userId: usuarios.gratis },
        }),
      ).toBe(patrones);
    });

    it('a plain reclassification (no period) is not limited', async () => {
      const junio = await movimiento('junio');

      const res = await llamar(
        'patch',
        `/api/transacciones/${junio.id}/categoria`,
        usuarios.gratis,
      ).send({ categoriaId: otraCategoriaId });

      expect(res.status).toBe(200);
    });

    it('Plus applies to similar movements of a hidden month', async () => {
      await darPlus(usuarios.gratis);
      const junio = await movimiento('junio');

      const res = await llamar(
        'patch',
        `/api/transacciones/${junio.id}/categoria`,
        usuarios.gratis,
      ).send({
        categoriaId: categoriaId,
        aplicarAParecidos: { periodo: '2026-03' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/movimientos', () => {
    const cuerpo = (fecha: string) => ({
      tipo: 'Gasto',
      fecha,
      descripcion: `${RUN_ID} manual ${fecha}`,
      monto: '2500',
      bucket: 'Deseos',
      categoriaId,
    });

    it('a date before the window is 403 and nothing is written', async () => {
      const antes = await contarTransacciones(usuarios.gratis);

      const res = await llamar(
        'post',
        '/api/movimientos',
        usuarios.gratis,
      ).send(cuerpo('2026-03-15'));

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PLUS_REQUERIDO);
      expect(await contarTransacciones(usuarios.gratis)).toBe(antes);
    });

    it('a date inside the window, or after the anchor, is registered', async () => {
      const hoy = new Date().toISOString().slice(0, 10);

      for (const fecha of ['2026-04-01', hoy]) {
        const res = await llamar(
          'post',
          '/api/movimientos',
          usuarios.gratis,
        ).send(cuerpo(fecha));
        expect(res.status).toBe(201);
      }
    });

    it('an invalid body is still 400', async () => {
      const res = await llamar(
        'post',
        '/api/movimientos',
        usuarios.gratis,
      ).send({ ...cuerpo('2026-03-15'), fecha: 'ayer' });

      expect(res.status).toBe(400);
    });

    it('Plus registers a movement in a hidden month', async () => {
      await darPlus(usuarios.gratis);
      const antes = await contarTransacciones(usuarios.gratis);

      const res = await llamar(
        'post',
        '/api/movimientos',
        usuarios.gratis,
      ).send(cuerpo('2026-03-16'));

      expect(res.status).toBe(201);
      expect(await contarTransacciones(usuarios.gratis)).toBe(antes + 1);
    });

    it('billing off registers a movement in a hidden month', async () => {
      const res = await llamar(
        'post',
        '/api/movimientos',
        usuarios.gratis,
        lanzamiento,
      ).send(cuerpo('2026-03-17'));

      expect(res.status).toBe(201);
    });
  });

  describe('not limited', () => {
    it('GET /api/ingestas answers on the free plan', async () => {
      const res = await llamar('get', '/api/ingestas', usuarios.gratis);

      expect(res.status).toBe(200);
    });
  });

  describe('financial months and anchors', () => {
    it('follows the cut-off day of the account', async () => {
      // Cut-off 25, movement on 26 Jun: anchor 2026-06, window 2026-04..06.
      const ruta = '/api/movimientos?periodo=';

      expect(
        (await llamar('get', `${ruta}2026-04`, usuarios.corte)).status,
      ).toBe(200);
      expect(
        (await llamar('get', `${ruta}2026-03`, usuarios.corte)).status,
      ).toBe(403);
    });

    it('places the date of a manual income in the month it is read in', async () => {
      const antes = await contarTransacciones(usuarios.corte);
      const cuerpo = (fecha: string) => ({
        tipo: 'Ingreso',
        fecha,
        descripcion: `${RUN_ID} corte ${fecha}`,
        monto: '5000',
      });

      // Cut-off 25: period 2026-04 starts on 25 Apr. An income up to 3 days
      // before is read in that period (PER-08), so it is visible; one 4 days
      // before belongs to 2026-03, before the window.
      const enviar = (fecha: string) =>
        llamar('post', '/api/movimientos', usuarios.corte).send(cuerpo(fecha));
      const oculto = await enviar('2026-04-21');
      const tolerado = await enviar('2026-04-24');
      const visible = await enviar('2026-04-25');

      expect(oculto.status).toBe(403);
      expect(tolerado.status).toBe(201);
      expect(visible.status).toBe(201);
      expect(await contarTransacciones(usuarios.corte)).toBe(antes + 2);
    });

    it('places the date of a manual expense in the financial month, with no tolerance', async () => {
      const antes = await contarTransacciones(usuarios.corte);

      const oculto = await llamar(
        'post',
        '/api/movimientos',
        usuarios.corte,
      ).send({
        tipo: 'Gasto',
        fecha: '2026-04-24',
        descripcion: `${RUN_ID} gasto corte`,
        monto: '5000',
        bucket: 'Deseos',
        categoriaId,
      });

      expect(oculto.status).toBe(403);
      expect(await contarTransacciones(usuarios.corte)).toBe(antes);
    });

    it('an account without movements anchors on the current month', async () => {
      const ahora = new Date();
      const mes = (atras: number) => {
        const d = new Date(
          Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - atras, 1),
        );
        return d.toISOString().slice(0, 7);
      };

      const lista = await llamar('get', '/api/periodos', usuarios.sinDatos);
      const actual = await llamar(
        'get',
        `/api/resumen?periodo=${mes(0)}`,
        usuarios.sinDatos,
      );
      const primeroVisible = await llamar(
        'get',
        `/api/resumen?periodo=${mes(2)}`,
        usuarios.sinDatos,
      );
      const oculto = await llamar(
        'get',
        `/api/resumen?periodo=${mes(3)}`,
        usuarios.sinDatos,
      );

      expect(lista.body.periodos).toEqual([]);
      expect(actual.status).toBe(200);
      expect(primeroVisible.status).toBe(200);
      expect(oculto.status).toBe(403);
    });

    it('one account never sees the window of another', async () => {
      // `antiguo` only has January 2025: its window is 2024-11..2025-01 and
      // every later month is after its anchor.
      const hidden = '/api/movimientos?periodo=2026-03';
      const suyo = '/api/movimientos?periodo=2025-01';

      expect((await llamar('get', hidden, usuarios.antiguo)).status).toBe(200);
      expect((await llamar('get', hidden, usuarios.gratis)).status).toBe(403);
      expect((await llamar('get', suyo, usuarios.antiguo)).status).toBe(200);
      expect((await llamar('get', suyo, usuarios.gratis)).status).toBe(403);
      expect(
        (await llamar('get', '/api/periodos', usuarios.antiguo)).body.periodos,
      ).toEqual(['2025-01']);
    });
  });
});
