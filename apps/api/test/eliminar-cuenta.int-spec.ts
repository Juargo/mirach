/**
 * eliminar-cuenta.int-spec.ts — `DELETE /api/cuenta` (Apple 5.1.1(v), Google
 * Play, Ley 21.719).
 *
 * Two users (A and B), each with the full footprint: sessions (two devices
 * for A), a bank account, ingestas (PROCESADA + FALLIDA), the copied category
 * catalog with its patterns, and transacciones classified into those
 * categories. A deletes the account through HTTP. Proves:
 *  - every A row is gone in EVERY table (and the user itself);
 *  - every B row is intact (isolation, RNF-SEC-006);
 *  - A's old tokens no longer authenticate (401), including a repeat call;
 *  - a wrong/missing confirmation deletes nothing.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- eliminar-cuenta`.
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `eliminar-cuenta-int-${Date.now()}`;
const USER_A = `user-a-${RUN_ID}`;
const USER_B = `user-b-${RUN_ID}`;

interface Huella {
  user: number;
  session: number;
  account: number;
  ingesta: number;
  categoria: number;
  patron: number;
  transaccion: number;
}

describe('DELETE /api/cuenta (integration — real DB)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authA1: string;
  let authA2: string;
  let authB: string;
  let huellaBInicial: Huella;

  const huella = async (userId: string): Promise<Huella> => ({
    user: await prisma.user.count({ where: { id: userId } }),
    session: await prisma.session.count({ where: { userId } }),
    account: await prisma.account.count({ where: { userId } }),
    ingesta: await prisma.ingesta.count({ where: { userId } }),
    categoria: await prisma.categoria.count({ where: { userId } }),
    patron: await prisma.patronClasificacion.count({ where: { userId } }),
    transaccion: await prisma.transaccion.count({
      where: { account: { userId } },
    }),
  });

  const sembrar = async (userId: string, nombre: string) => {
    await prisma.user.create({ data: { id: userId, nombre } });
    await crearCatalogoParaUsuario(prisma, userId);
    const account = await prisma.account.create({
      data: {
        userId,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `cta-${userId}`,
      },
    });
    const ingesta = await prisma.ingesta.create({
      data: {
        userId,
        accountId: account.id,
        banco: 'BCI',
        nombreArchivo: `${userId}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 2,
      },
    });
    await prisma.ingesta.create({
      data: {
        userId,
        accountId: null,
        banco: null,
        nombreArchivo: `${userId}-fallida.xlsx`,
        estado: 'FALLIDA',
        motivoFallo: 'Extensión de archivo no soportada',
      },
    });
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { userId },
    });
    for (const cargo of [1000n, 2000n]) {
      await prisma.transaccion.create({
        data: {
          accountId: account.id,
          ingestaId: ingesta.id,
          categoriaId: categoria.id,
          bucketId: categoria.bucketId,
          fecha: new Date('2026-07-15T00:00:00.000Z'),
          cargo,
          abono: 0n,
          descripcion: 'Test tx',
        },
      });
    }
  };

  const borrarTodo = async (userId: string) => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.transaccion.deleteMany({ where: { account: { userId } } });
    await prisma.ingesta.deleteMany({ where: { userId } });
    await prisma.patronClasificacion.deleteMany({ where: { userId } });
    await prisma.categoria.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  };

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    await sembrar(USER_A, `Cuenta A ${RUN_ID}`);
    await sembrar(USER_B, `Cuenta B ${RUN_ID}`);
    authA1 = `Bearer ${(await crearSesionParaUsuario(prisma, USER_A)).token}`;
    authA2 = `Bearer ${(await crearSesionParaUsuario(prisma, USER_A)).token}`;
    authB = `Bearer ${(await crearSesionParaUsuario(prisma, USER_B)).token}`;
    huellaBInicial = await huella(USER_B);
  });

  afterAll(async () => {
    if (!ALLOW) return;
    await borrarTodo(USER_A);
    await borrarTodo(USER_B);
    await prisma.$disconnect();
  });

  const eliminar = (auth: string | undefined, body?: object) => {
    const req = request(app).delete('/api/cuenta').set('x-api-key', API_KEY);
    if (auth !== undefined) req.set('Authorization', auth);
    return body === undefined ? req : req.send(body);
  };

  it('pre-condición: A y B tienen datos en todas las tablas', async () => {
    if (!ALLOW) return;

    for (const h of [await huella(USER_A), await huella(USER_B)]) {
      expect(h.user).toBe(1);
      expect(h.session).toBeGreaterThanOrEqual(1);
      expect(h.account).toBe(1);
      expect(h.ingesta).toBe(2);
      expect(h.categoria).toBeGreaterThan(0);
      expect(h.patron).toBeGreaterThan(0);
      expect(h.transaccion).toBe(2);
    }
  });

  it('401 sin sesión y nada se borra', async () => {
    if (!ALLOW) return;

    await eliminar(undefined, { confirmacion: 'ELIMINAR' }).expect(401);
    expect((await huella(USER_A)).user).toBe(1);
  });

  it.each([
    ['sin body', undefined],
    ['confirmación en minúsculas', { confirmacion: 'eliminar' }],
    ['confirmación de otro tipo', { confirmacion: true }],
  ])('400 CONFIRMACION_INVALIDA (%s) y no se borra nada', async (_n, body) => {
    if (!ALLOW) return;

    const before = await huella(USER_A);
    const res = await eliminar(authA1, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONFIRMACION_INVALIDA');
    expect(await huella(USER_A)).toEqual(before);
  });

  it('204: borra TODAS las filas de A (todas las tablas) y deja intactas las de B', async () => {
    if (!ALLOW) return;

    const res = await eliminar(authA1, { confirmacion: 'ELIMINAR' });

    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    expect(await huella(USER_A)).toEqual({
      user: 0,
      session: 0,
      account: 0,
      ingesta: 0,
      categoria: 0,
      patron: 0,
      transaccion: 0,
    });
    // Aislamiento (RNF-SEC-006): B no pierde ni una fila.
    expect(await huella(USER_B)).toEqual(huellaBInicial);
  });

  it('los tokens de A (ambos dispositivos) ya no autentican: 401; B sigue autenticando', async () => {
    if (!ALLOW) return;

    // /api/categorias: autentica por sesión sin exigir email (los usuarios
    // sembrados acá no lo tienen, y /api/auth/me lo requiere).
    for (const auth of [authA1, authA2]) {
      await request(app)
        .get('/api/categorias')
        .set('x-api-key', API_KEY)
        .set('Authorization', auth)
        .expect(401);
    }
    await request(app)
      .get('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', authB)
      .expect(200);
  });

  it('repetir la petición con el token ya borrado → 401 (el middleware, no el use case)', async () => {
    if (!ALLOW) return;

    await eliminar(authA1, { confirmacion: 'ELIMINAR' }).expect(401);
    expect(await huella(USER_B)).toEqual(huellaBInicial);
  });
});
