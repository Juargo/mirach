import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { authCapabilitiesResponseSchema } from './schemas/auth-capabilities.schema';

/**
 * GET /api/auth/capabilities (AC-10, design §8/D7) — session-public,
 * api-key required, ALWAYS mounted (unlike the Google routes themselves,
 * which only exist as a 404 stub until activated). This is the seam the
 * web/mobile clients read to decide whether to render their own
 * "Continuar con Google" affordance. `googleLoginEnabled` (web) and
 * `googleLoginMobileEnabled` (mobile, AUTH-22) are independently computed —
 * this spec exercises all four combinations.
 */
function fakeContainer(
  googleAuth: Container['googleAuth'],
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
    googleAuthMobile,
  } as unknown as Container;
}

function stubGoogleAuthMobileGraph(): NonNullable<
  Container['googleAuthMobile']
> {
  return {
    verificadorIdToken: { verificarIdToken: vi.fn() },
    loginConGoogle: { execute: vi.fn() },
    googleTokenRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
  } as unknown as NonNullable<Container['googleAuthMobile']>;
}

describe('GET /api/auth/capabilities (AC-10)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 sin x-api-key (api-key global)', async () => {
    const res = await request(createApp(fakeContainer(undefined), testEnv)).get(
      '/api/auth/capabilities',
    );

    expect(res.status).toBe(401);
  });

  it('200 con api-key SIN sesión (session-public, AC-10)', async () => {
    const res = await request(createApp(fakeContainer(undefined), testEnv))
      .get('/api/auth/capabilities')
      .set('x-api-key', KEY);

    expect(res.status).toBe(200);
  });

  const googleAuthStub = {
    iniciador: {},
    loginConGoogle: {},
    googleRateLimiter: {},
  } as unknown as Container['googleAuth'];

  it.each([
    [googleAuthStub, stubGoogleAuthMobileGraph(), true, true],
    [googleAuthStub, undefined, true, false],
    [undefined, stubGoogleAuthMobileGraph(), false, true],
    [undefined, undefined, false, false],
  ])(
    'reporta googleLoginEnabled/googleLoginMobileEnabled independientemente (web=%s, mobile=%s)',
    async (googleAuth, googleAuthMobile, expectedWeb, expectedMobile) => {
      const res = await request(
        createApp(fakeContainer(googleAuth, googleAuthMobile), testEnv),
      )
        .get('/api/auth/capabilities')
        .set('x-api-key', KEY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        googleLoginEnabled: expectedWeb,
        googleLoginMobileEnabled: expectedMobile,
      });
    },
  );

  it('el body 200 real cumple authCapabilitiesResponseSchema (garantía de sincronía)', async () => {
    const res = await request(createApp(fakeContainer(undefined), testEnv))
      .get('/api/auth/capabilities')
      .set('x-api-key', KEY);

    expect(() => authCapabilitiesResponseSchema.parse(res.body)).not.toThrow();
  });
});
