import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Regresión del §4.4 routing trap (design): un router NUNCA montado cae en
 * `protectedApi` (que monta `sessionMiddleware` con `router.use(mw)` SIN
 * path — corre para TODA request que llegue, matcheada o no) y responde 401,
 * no 404. AUTH-16 exige 404 cuando el feature está apagado, así que
 * `app.ts` monta SIEMPRE un router en `/api/auth/google*` — el registrar
 * "real" (Slice C2) o el stub deshabilitado (`registrarAuthGoogleDeshabilitado`,
 * este slice) — nunca deja el path sin mount alguno.
 */
function fakeContainer(
  googleAuth: Container['googleAuth'] = undefined,
): Container {
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
    previewIngesta: stub,
    eliminarIngesta: stub,
    listarIngestas: stub,
    login: { execute: vi.fn() },
    logout: { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) },
    obtenerIdentidad: { execute: vi.fn() },
    crearDemo: {
      execute: vi.fn().mockResolvedValue({ token: 'd', expiresAt: new Date() }),
    },
    googleAuth,
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
    logger: { raw: {} },
  } as unknown as Container;
}

describe('/api/auth/google — activation seam (AUTH-16, design §4.4)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  describe('feature apagada (container.googleAuth === undefined)', () => {
    it('GET /api/auth/google: 404 (nunca 401 por fallthrough al router protegido)', async () => {
      const res = await request(createApp(fakeContainer(undefined), testEnv))
        .get('/api/auth/google')
        .set('x-api-key', KEY);

      expect(res.status).toBe(404);
    });

    it('GET /api/auth/google/callback: 404 (nunca 401 por fallthrough al router protegido)', async () => {
      const res = await request(createApp(fakeContainer(undefined), testEnv))
        .get('/api/auth/google/callback')
        .set('x-api-key', KEY);

      expect(res.status).toBe(404);
    });

    it('GET /api/auth/google: 404 incluso SIN x-api-key (el stub 404 corre antes de que la ausencia de sesión importe — pero la api-key global sigue aplicando primero)', async () => {
      const res = await request(
        createApp(fakeContainer(undefined), testEnv),
      ).get('/api/auth/google');

      // La api-key global (`app.use('/api', createApiKeyMiddleware(...))`)
      // corre ANTES que el router session-public — sin key, 401, no 404.
      // Este test documenta ese orden (no es un caso de C1.5 en sí, es la
      // precondición sobre la que corre la 404) para que quede explícito
      // que el 404 de abajo SIEMPRE se prueba CON api-key.
      expect(res.status).toBe(401);
    });
  });

  /**
   * Slice C2 supersedes the C1-era invariant this describe block used to
   * assert ("stub always mounted, `googleAuth` ignored"). `app.ts` now
   * branches for real: `container.googleAuth !== undefined` mounts
   * `registrarAuthGoogle` (the real handlers), not the stub. This is the
   * regression guard for THAT flip — the C1.5/C1.6 404-when-undefined
   * coverage above is untouched and still holds.
   */
  describe('feature "prendida" (container.googleAuth definido) — C2 monta las rutas reales, no el stub', () => {
    function stubGoogleAuthGraph(): NonNullable<Container['googleAuth']> {
      return {
        iniciador: {
          iniciar: vi.fn().mockResolvedValue(
            Result.ok({
              urlAutorizacion:
                'https://accounts.google.com/o/oauth2/v2/auth?x=1',
              state: 's',
              nonce: 'n',
              codeVerifier: 'v',
            }),
          ),
        },
        verificador: { verificar: vi.fn() },
        loginConGoogle: { execute: vi.fn() },
        googleRateLimiter: {
          isBlocked: vi.fn().mockReturnValue(false),
          recordFailure: vi.fn(),
          reset: vi.fn(),
        },
      } as unknown as NonNullable<Container['googleAuth']>;
    }

    it('GET /api/auth/google: 302 a Google (rutas reales montadas, ya NO 404)', async () => {
      const res = await request(
        createApp(fakeContainer(stubGoogleAuthGraph()), testEnv),
      )
        .get('/api/auth/google')
        .set('x-api-key', KEY);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      );
    });
  });
});
