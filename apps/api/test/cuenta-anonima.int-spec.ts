/**
 * Anonymous account (ADR-013) against a real DB: sign-up, isolation between
 * two anonymous accounts, linking to a new identity and the conflict with an
 * identity that already owns an account.
 *
 * Requires a real DB. Run via `pnpm api test:integration`.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import type { GoogleAuthMobileGraph } from '../src/composition/crear-auth-google-mobile';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { Result } from '../src/shared/result';
import { IpRateLimiter } from '../src/infrastructure/http/auth/ip-rate-limiter';
import { CATEGORIA_TEMPLATE_SIZE } from '../src/infrastructure/persistence/catalogo-template';
import type { IdentidadExterna } from '../src/application/ports/verificador-identidad-externa.port';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `cuenta-anonima-int-${Date.now()}`;
const DIA_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!ALLOW)('Anonymous account (int, ADR-013)', () => {
  let prisma: PrismaClient;
  let app: Express;
  /** The identity the stubbed Google verifier answers with. */
  let identidadGoogle: IdentidadExterna;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const base = createContainer(env, prisma);
    const sinLimite = (prefijo: string) =>
      new IpRateLimiter(`${prefijo}:${RUN_ID}:`, 1000, 900_000);
    const googleAuthMobile = {
      ...base.googleAuthMobile,
      verificadorIdToken: {
        verificarIdToken: vi.fn(() =>
          Promise.resolve(Result.ok(identidadGoogle)),
        ),
      },
    } as unknown as GoogleAuthMobileGraph;

    app = createApp(
      {
        ...base,
        googleAuthMobile,
        altaAnonimaRateLimiter: sinLimite('alta'),
        vincularRateLimiter: sinLimite('vincular'),
      },
      env,
    );
  });

  afterAll(async () => {
    const where = { userId: { in: createdUserIds } };
    await prisma.session.deleteMany({ where });
    await prisma.consentimiento.deleteMany({ where });
    await prisma.patronClasificacion.deleteMany({ where });
    await prisma.categoria.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function altaAnonima(): Promise<{ token: string; userId: string }> {
    const res = await request(app)
      .post('/api/auth/anonimo')
      .set('x-api-key', API_KEY)
      .send({ versionTerminos: '1.0', versionPrivacidad: '1.0' });

    expect(res.status).toBe(200);
    createdUserIds.push(res.body.userId);
    return res.body;
  }

  function conSesion(metodo: 'get' | 'post', ruta: string, token: string) {
    return request(app)
      [metodo](ruta)
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${token}`);
  }

  it('sign-up creates a user with no credentials, its catalog, the terms and a 365-day session', async () => {
    const antes = Date.now();
    const { userId, token } = await altaAnonima();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      email: null,
      emailBlindIndex: null,
      appleSub: null,
      googleSub: null,
      passwordHash: null,
    });
    expect(await prisma.categoria.count({ where: { userId } })).toBe(
      CATEGORIA_TEMPLATE_SIZE,
    );
    expect(await prisma.consentimiento.count({ where: { userId } })).toBe(2);

    const [sesion] = await prisma.session.findMany({ where: { userId } });
    const vida = sesion.expiresAt.getTime() - antes;
    expect(vida).toBeGreaterThan(364 * DIA_MS);
    expect(vida).toBeLessThan(366 * DIA_MS);

    const me = await conSesion('get', '/api/auth/me', token);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      userId,
      email: '',
      googleVinculado: false,
    });
  });

  it('an anonymous session is extended on use once more than a day of it was consumed', async () => {
    const { userId, token } = await altaAnonima();
    const gastada = new Date(Date.now() + 100 * DIA_MS);
    await prisma.session.updateMany({
      where: { userId },
      data: { expiresAt: gastada },
    });

    const me = await conSesion('get', '/api/auth/me', token);

    expect(me.status).toBe(200);
    const [sesion] = await prisma.session.findMany({ where: { userId } });
    expect(sesion.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 364 * DIA_MS,
    );
  });

  it('one anonymous account never sees the data of another', async () => {
    const a = await altaAnonima();
    const b = await altaAnonima();
    const idsDe = async (userId: string) =>
      (
        await prisma.categoria.findMany({
          where: { userId },
          select: { id: true },
        })
      ).map((c) => c.id);
    const [deA, deB] = await Promise.all([idsDe(a.userId), idsDe(b.userId)]);

    const res = await conSesion('get', '/api/categorias', a.token);

    expect(res.status).toBe(200);
    const cuerpo = JSON.stringify(res.body);
    expect(deA.every((id) => cuerpo.includes(id))).toBe(true);
    expect(deB.some((id) => cuerpo.includes(id))).toBe(false);
  });

  it('linking a new Google identity keeps the user and its data and replaces the session', async () => {
    const { userId, token } = await altaAnonima();
    const email = `${RUN_ID}-nuevo@example.com`;
    identidadGoogle = {
      sub: `${RUN_ID}-sub-nuevo`,
      email,
      emailVerificado: true,
    };

    const res = await conSesion(
      'post',
      '/api/cuenta/vincular/google',
      token,
    ).send({ idToken: 'jwt' });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.token).not.toBe(token);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleSub).toBe(`${RUN_ID}-sub-nuevo`);
    expect(user.email).not.toBeNull();
    expect(user.email).not.toContain(email);
    expect(await prisma.categoria.count({ where: { userId } })).toBe(
      CATEGORIA_TEMPLATE_SIZE,
    );

    const anterior = await conSesion('get', '/api/auth/me', token);
    expect(anterior.status).toBe(401);
    const nueva = await conSesion('get', '/api/auth/me', res.body.token);
    expect(nueva.body).toMatchObject({ userId, email, googleVinculado: true });

    const [sesion] = await prisma.session.findMany({ where: { userId } });
    expect(sesion.expiresAt.getTime()).toBeLessThan(Date.now() + 8 * DIA_MS);

    const otraVez = await conSesion(
      'post',
      '/api/cuenta/vincular/google',
      res.body.token,
    ).send({ idToken: 'jwt' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.code).toBe('CUENTA_NO_ANONIMA');
  });

  it.each([
    [
      'its sub',
      (sub: string) => ({ sub, email: null, emailVerificado: false }),
    ],
    [
      'its verified email',
      (_sub: string, email: string) => ({
        sub: `${RUN_ID}-sub-distinto`,
        email,
        emailVerificado: true,
      }),
    ],
  ])(
    'an identity that already owns an account by %s is 409 and changes nothing',
    async (_caso, identidadDe) => {
      const duena = await altaAnonima();
      const sub = `${RUN_ID}-sub-${createdUserIds.length}`;
      const email = `${RUN_ID}-${createdUserIds.length}@example.com`;
      identidadGoogle = { sub, email, emailVerificado: true };
      const previa = await conSesion(
        'post',
        '/api/cuenta/vincular/google',
        duena.token,
      ).send({ idToken: 'jwt' });
      expect(previa.status).toBe(200);

      const anonima = await altaAnonima();
      identidadGoogle = identidadDe(sub, email);
      const res = await conSesion(
        'post',
        '/api/cuenta/vincular/google',
        anonima.token,
      ).send({ idToken: 'jwt' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CUENTA_YA_EXISTE');
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: anonima.userId },
      });
      expect(user).toMatchObject({ googleSub: null, email: null });
      const sigue = await conSesion('get', '/api/auth/me', anonima.token);
      expect(sigue.status).toBe(200);
    },
  );
});
