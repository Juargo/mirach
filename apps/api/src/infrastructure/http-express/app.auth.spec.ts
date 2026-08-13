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
        .mockResolvedValue(
          Result.ok({ userId: 'user-de-sesion', esDemo: false }),
        ),
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
          nombre: 'Jorge',
          email: 'a@b.cl',
          esDemo: false,
          googleVinculado: false,
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
    perfil: {
      actualizarPerfil: stub,
      cambiarPassword: stub,
      desvincularGoogle: {
        execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
      },
    },
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
 * `POST /api/perfil/google/vincular` — el gate de activación split (US-041,
 * design §1/Q2b, binding item #4). `fakeContainer()` no setea `googleAuth`
 * (queda `undefined`, feature apagada) — este es EXACTAMENTE el estado que
 * el entorno de test de la propia API tiene por defecto, el mismo caso que
 * la propuesta habría dejado como un `500`.
 */
describe('POST /api/perfil/google/vincular — AUTH-16 parity (US-041)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('404 (no 500, no 401) cuando container.googleAuth es undefined — feature apagada', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/perfil/google/vincular')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(404);
  });

  it('401 sin sesión, incluso apagada (api-key global pero sin token — el gate de activación no se salta la sesión)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/perfil/google/vincular')
      .set('x-api-key', KEY)
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(401);
  });

  it('200 { urlAutorizacion } cuando container.googleAuth SÍ está definido — mounted, iniciarVinculacion invocado con la sesión', async () => {
    const iniciarVinculacion = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
          state: 's1',
          nonce: 'n1',
          codeVerifier: 'v1',
        }),
      ),
    };
    const c = {
      ...fakeContainer(),
      googleAuth: {
        iniciador: { iniciar: vi.fn() },
        verificador: { verificar: vi.fn() },
        loginConGoogle: { execute: vi.fn() },
        vincularGoogle: { execute: vi.fn() },
        googleRateLimiter: { isBlocked: vi.fn(), recordFailure: vi.fn() },
        iniciarVinculacion,
        linkIntentKey: Buffer.alloc(32, 8),
      },
    } as unknown as Container;

    const res = await request(createApp(c, testEnv))
      .post('/api/perfil/google/vincular')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.urlAutorizacion).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
    expect(iniciarVinculacion.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      esDemo: false,
      passwordActual: 'x',
    });
  });
});

/**
 * `POST /api/perfil/google/desvincular` — task 3.9, design §1/Q2b. A
 * diferencia del link, esta ruta se monta SIEMPRE en `protectedApi`, sin
 * el gate `container.googleAuth !== undefined` — `fakeContainer()` no
 * setea `googleAuth` (feature de login con Google apagada) y aun así este
 * endpoint responde, no un `404`.
 */
describe('POST /api/perfil/google/desvincular — mounted always, no activation gate (US-041 PR#3)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('204 cuando container.googleAuth es undefined (Google apagado) — unlink sigue montado', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .post('/api/perfil/google/desvincular')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(204);
    expect(c.perfil.desvincularGoogle.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      esDemo: false,
      passwordActual: 'x',
    });
  });

  it('401 sin sesión (api-key global pero sin token)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/perfil/google/desvincular')
      .set('x-api-key', KEY)
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(401);
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
