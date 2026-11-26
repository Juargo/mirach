/**
 * E2E tests for the bank limit of the free plan (IMP-24, S15).
 *
 * Builds the real container and app from env: billing on with no trial (free
 * plan unless the account holds a grant), FREE_PLAN_MAX_BANKS=2. The statement
 * fixture is a BCI one.
 *
 * Covered scenarios:
 *   - a free account imports from its first and second bank
 *   - with two other banks already used, preview and commit are 403
 *     PLAN_PLUS_REQUERIDO and persist nothing (no account, no import, not even
 *     a failed one)
 *   - the banks of the account are its FIRST two, whatever it used later
 *   - the account of hand-registered movements is not a bank
 *   - Plus and billing off have no limit
 *   - another user's banks never count
 */
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { PrismaBancosImportadosReader } from '../src/infrastructure/persistence/prisma-bancos-importados.reader';
import { loadEnv } from '../src/config/env';
import { copiarCatalogoTemplate } from '../src/infrastructure/persistence/catalogo-template';
import { crearSesionParaUsuario } from './support/session.fixture';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `bancos-e2e-${Date.now()}`;
const CARTOLA_BCI = join(__dirname, 'fixtures', 'movimientos-test.xlsx');
const PLUS_REQUERIDO = {
  code: 'PLAN_PLUS_REQUERIDO',
  message: 'Esta función es parte de Mirach Plus.',
};

describe('free plan bank limit (e2e, IMP-24)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let conCobro: Express;
  let lanzamiento: Express;
  const [marcela, otro] = [`${RUN_ID}-marcela`, `${RUN_ID}-otro`];
  const usuarios = [marcela, otro];
  const auth: Record<string, string> = {};
  let orden = 0;

  function buildApp(extra: Record<string, string | undefined>): Express {
    const env = loadEnv({ ...process.env, ...extra });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }

  const subir = (
    ruta: 'preview' | 'commit',
    userId = marcela,
    app: Express = conCobro,
  ) =>
    request(app)
      .post(`/api/ingestas/${ruta}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth[userId])
      .attach('file', CARTOLA_BCI, `${RUN_ID}.xlsx`);

  /** An account in `banco`, created after every earlier one of this run. */
  const cuentaEn = (banco: string, userId = marcela) =>
    prisma.account.create({
      data: {
        userId,
        banco,
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `${RUN_ID}-${++orden}`,
        numeroCuentaBlindIndex: `${RUN_ID}-${orden}`,
        creadoEn: new Date(Date.UTC(2026, 0, 1) + orden * 1000),
      },
    });

  const guardado = async (userId = marcela) => ({
    cuentas: await prisma.account.count({ where: { userId } }),
    ingestas: await prisma.ingesta.count({ where: { userId } }),
    movimientos: await prisma.transaccion.count({
      where: { account: { userId } },
    }),
  });

  const limpiar = async () => {
    const cuenta = { where: { userId: { in: usuarios } } };
    await prisma.permisoPlan.deleteMany(cuenta);
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: usuarios } } },
    });
    await prisma.ingesta.deleteMany(cuenta);
    await prisma.account.deleteMany(cuenta);
  };

  beforeAll(async () => {
    conCobro = buildApp({
      PLUS_BILLING_STARTS_AT: '2026-01-01T00:00:00Z',
      PLUS_TRIAL_DAYS: '0',
      FREE_PLAN_MAX_BANKS: '2',
    });
    lanzamiento = buildApp({
      PLUS_BILLING_STARTS_AT: undefined,
      FREE_PLAN_MAX_BANKS: '2',
    });
    prisma = prismas[0];
    for (const id of usuarios) {
      await prisma.user.create({ data: { id, nombre: id } });
      await copiarCatalogoTemplate(prisma, id);
      auth[id] = `Bearer ${(await crearSesionParaUsuario(prisma, id)).token}`;
    }
  });

  beforeEach(limpiar);

  afterAll(async () => {
    await limpiar();
    const cuenta = { where: { userId: { in: usuarios } } };
    await prisma.session.deleteMany(cuenta);
    await prisma.patronClasificacion.deleteMany(cuenta);
    await prisma.categoria.deleteMany(cuenta);
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  it('a free account imports from its first bank', async () => {
    expect((await subir('preview')).status).toBe(200);

    const res = await subir('commit');

    expect(res.status).toBe(201);
    expect(await guardado()).toMatchObject({ cuentas: 1, ingestas: 1 });
  });

  it('a free account imports from its second bank', async () => {
    await cuentaEn('Santander');

    expect((await subir('preview')).status).toBe(200);
    expect((await subir('commit')).status).toBe(201);
  });

  it('with two other banks used, preview and commit are 403 and persist nothing', async () => {
    await cuentaEn('Santander');
    await cuentaEn('BancoEstado');
    const antes = await guardado();

    for (const ruta of ['preview', 'commit'] as const) {
      const res = await subir(ruta);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PLUS_REQUERIDO);
    }
    expect(await guardado()).toEqual(antes);
  });

  it('a second account in one of its two banks does not use another seat', async () => {
    await cuentaEn('Santander');
    await cuentaEn('Santander');
    await cuentaEn('BCI');

    expect((await subir('commit')).status).toBe(201);
  });

  it('its banks are the first two: a bank used later, on Plus, is closed again', async () => {
    await cuentaEn('Santander');
    await cuentaEn('BancoEstado');
    await cuentaEn('BCI');

    const res = await subir('commit');

    expect(res.status).toBe(403);
    expect(res.body).toEqual(PLUS_REQUERIDO);
    // What was imported from that bank stays.
    expect((await guardado()).cuentas).toBe(3);
  });

  it('the account of hand-registered movements is not a bank', async () => {
    await cuentaEn('Manual');
    await cuentaEn('Santander');

    expect((await subir('commit')).status).toBe(201);
  });

  it('Plus has no bank limit', async () => {
    await cuentaEn('Santander');
    await cuentaEn('BancoEstado');
    await prisma.permisoPlan.create({
      data: { userId: marcela, motivo: 'fundador' },
    });

    expect((await subir('preview')).status).toBe(200);
    expect((await subir('commit')).status).toBe(201);
  });

  it('nothing is limited while billing is off', async () => {
    await cuentaEn('Santander');
    await cuentaEn('BancoEstado');

    expect((await subir('commit', marcela, lanzamiento)).status).toBe(201);
  });

  it("another user's banks never count (RNF-SEC-006)", async () => {
    await cuentaEn('Santander', otro);
    await cuentaEn('BancoEstado', otro);

    expect((await subir('commit')).status).toBe(201);
    expect((await subir('commit', otro)).status).toBe(403);
    expect((await guardado(otro)).ingestas).toBe(0);
  });

  it('the reader lists the distinct banks of the user in order of first import', async () => {
    await cuentaEn('Santander');
    await cuentaEn('Manual');
    await cuentaEn('BCI');
    await cuentaEn('Santander');
    await cuentaEn('BancoEstado', otro);

    const reader = new PrismaBancosImportadosReader(prisma);

    expect(await reader.bancosEnOrdenDeImportacion(marcela)).toEqual([
      'Santander',
      'BCI',
    ]);
    expect(await reader.bancosEnOrdenDeImportacion(otro)).toEqual([
      'BancoEstado',
    ]);
  });
});
