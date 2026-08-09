import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Mirror de `app.auth-google.spec.ts` para el gate mobile (AUTH-19..24,
 * ADR-035 M1, design §6.1/§4.4). Mismo routing trap: un router NUNCA montado
 * en `/api/auth/google/token` caería en `protectedApi` de abajo, cuyo
 * `sessionMiddleware` sin path (`router.use(mw)`) corre para TODA request
 * llegada al router y respondería 401, no el 404 que exige AUTH-22 — por eso
 * `app.ts` monta SIEMPRE un router acá, el real (`registrarAuthGoogleToken`)
 * o el stub deshabilitado (`registrarAuthGoogleTokenDeshabilitado`).
 *
 * `container.googleAuthMobile` es un gate INDEPENDIENTE de
 * `container.googleAuth` (AUTH-22, decisión Q2) — este spec solo ejercita el
 * primero, dejando `googleAuth` en `undefined`.
 */
function fakeContainer(
  googleAuthMobile: Container['googleAuthMobile'] = undefined,
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
    googleAuth: undefined,
    googleAuthMobile,
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

function stubGoogleAuthMobileGraph(): NonNullable<
  Container['googleAuthMobile']
> {
  return {
    verificadorIdToken: {
      verificarIdToken: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ sub: 'sub-1', email: 'a@b.cl', emailVerificado: true }),
        ),
    },
    loginConGoogle: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          token: 'tok',
          userId: 'user-1',
          expiresAt: new Date('2026-08-15T00:00:00.000Z'),
        }),
      ),
    },
    googleTokenRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
  } as unknown as NonNullable<Container['googleAuthMobile']>;
}

describe('/api/auth/google/token — activation seam (AUTH-19..24, design §6.1)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('AC-11: 401 SIN x-api-key, incluso con googleAuthMobile configurado (la api-key global corre antes que cualquier router session-public)', async () => {
    const res = await request(
      createApp(fakeContainer(stubGoogleAuthMobileGraph()), testEnv),
    )
      .post('/api/auth/google/token')
      .send({ idToken: 'a-token' });

    expect(res.status).toBe(401);
  });

  describe('feature apagada (container.googleAuthMobile === undefined)', () => {
    it('404 CON x-api-key (gate estructural — el tipo del campo, no un flag booleano)', async () => {
      const res = await request(createApp(fakeContainer(undefined), testEnv))
        .post('/api/auth/google/token')
        .set('x-api-key', KEY)
        .send({ idToken: 'a-token' });

      expect(res.status).toBe(404);
    });

    it('404, NUNCA el 401 del sessionMiddleware (routing trap documentado: un router no-montado cae en protectedApi)', async () => {
      const res = await request(createApp(fakeContainer(undefined), testEnv))
        .post('/api/auth/google/token')
        .set('x-api-key', KEY)
        .send({ idToken: 'a-token' });

      expect(res.status).not.toBe(401);
      expect(res.status).toBe(404);
    });
  });

  describe('feature "prendida" (container.googleAuthMobile definido)', () => {
    it('200 con x-api-key y SIN cookie/header de sesión (session-public, mobile es Bearer + SecureStore, MOB-02)', async () => {
      const res = await request(
        createApp(fakeContainer(stubGoogleAuthMobileGraph()), testEnv),
      )
        .post('/api/auth/google/token')
        .set('x-api-key', KEY)
        .send({ idToken: 'a-token' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        token: 'tok',
        userId: 'user-1',
        expiresAt: '2026-08-15T00:00:00.000Z',
      });
    });
  });
});
