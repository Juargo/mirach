import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { authMeResponseSchema } from './schemas/auth-me.schema';
import { authLoginResponseSchema } from './schemas/auth-login.schema';

/**
 * Gate arquitectónico de Slice 7: el montaje session-public vs protegido.
 *   - login (session-public): exige api-key, NO sesión.
 *   - me (protegido): exige api-key Y sesión.
 * Más el aislamiento: el userId del `me` sale de la sesión.
 */
const EXPIRA = new Date('2026-08-01T00:00:00.000Z');

function fakeContainer(): Container {
  const stub = { execute: vi.fn() };
  return {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: stub,
    calcularResumenAnual: stub,
    obtenerDetalleBucket: stub,
    obtenerMovimientosMes: stub,
    reclasificarTransaccion: stub,
    processIngesta: stub,
    login: {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ token: 'tok', userId: 'u1', expiresAt: EXPIRA }),
        ),
    },
    logout: { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) },
    obtenerIdentidad: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-de-sesion',
          email: 'a@b.cl',
          esDemo: false,
        }),
      ),
    },
    crearDemo: {
      execute: vi.fn().mockResolvedValue({ token: 'd', expiresAt: EXPIRA }),
    },
    loginRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    demoRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
    },
    demoCleanup: { borrarExpirados: vi.fn().mockResolvedValue(undefined) },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('/api/auth — session-public vs protegido', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('POST /api/auth/login: 401 sin x-api-key (api-key global)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/auth/login')
      .send({ email: 'a@b.cl', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login: 200 con api-key SIN sesión (session-public)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/auth/login')
      .set('x-api-key', KEY)
      .send({ email: 'a@b.cl', password: 'secreta' });
    expect(res.status).toBe(200);
  });

  it('POST /api/auth/login: el body 200 real cumple authLoginResponseSchema (garantía de sincronía, openapi-contract-express)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/auth/login')
      .set('x-api-key', KEY)
      .send({ email: 'a@b.cl', password: 'secreta' });

    expect(res.status).toBe(200);
    expect(() => authLoginResponseSchema.parse(res.body)).not.toThrow();
  });

  it('GET /api/auth/me: 401 con api-key pero SIN sesión (protegido)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/auth/me')
      .set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me: 200 con api-key + sesión; el userId sale de la sesión', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/auth/me')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerIdentidad.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
    });
  });

  it('GET /api/auth/me: el body 200 real cumple authMeResponseSchema (garantía de sincronía, openapi-contract-express)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/auth/me')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(() => authMeResponseSchema.parse(res.body)).not.toThrow();
  });
});

/**
 * Gate de seguridad (ADR-013/029): `createApp` deriva `cookieSecure` de
 * `env.NODE_ENV === 'production' || env.COOKIE_SECURE`. Este derive no tenía
 * cobertura propia tras el refactor de Slice 5 — solo se probaba el flujo de
 * la cookie a partir de un `cookieSecure: boolean` ya resuelto
 * (`auth.routes.spec.ts`), nunca la regla que lo calcula desde `env`.
 *
 * `buildTestEnv` construye un `Env` real vía `loadEnv()` y luego aplica los
 * overrides SIN volver a pasar por `superRefine` — por eso puede construir el
 * estado `production + COOKIE_SECURE=false`, que `loadEnv()` real rechazaría
 * en boot (ver env.fixture.ts). Es exactamente el estado que este test
 * necesita para probar la rama `NODE_ENV === 'production'` del `||`.
 */
describe('createApp — derivación de cookieSecure (env.NODE_ENV || env.COOKIE_SECURE)', () => {
  const KEY = 'k'.repeat(64);

  async function loginSetCookie(
    env: ReturnType<typeof buildTestEnv>,
  ): Promise<string | undefined> {
    const res = await request(createApp(fakeContainer(), env))
      .post('/api/auth/login')
      .set('x-api-key', KEY)
      .send({ email: 'a@b.cl', password: 'secreta' });
    return res.headers['set-cookie']?.[0];
  }

  it('NODE_ENV=production fuerza Secure incluso con COOKIE_SECURE=false', async () => {
    const env = buildTestEnv({
      API_KEY: KEY,
      NODE_ENV: 'production',
      COOKIE_SECURE: false,
    });

    const cookie = await loginSetCookie(env);

    expect(cookie).toContain('Secure');
  });

  it('NODE_ENV=development con COOKIE_SECURE=true también resulta en Secure (rama || COOKIE_SECURE)', async () => {
    const env = buildTestEnv({
      API_KEY: KEY,
      NODE_ENV: 'development',
      COOKIE_SECURE: true,
    });

    const cookie = await loginSetCookie(env);

    expect(cookie).toContain('Secure');
  });

  it('NODE_ENV=development con COOKIE_SECURE=false NO agrega Secure', async () => {
    const env = buildTestEnv({
      API_KEY: KEY,
      NODE_ENV: 'development',
      COOKIE_SECURE: false,
    });

    const cookie = await loginSetCookie(env);

    expect(cookie).not.toContain('Secure');
  });
});
