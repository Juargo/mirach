import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Seam de activación de `POST /api/auth/apple/token`: SIEMPRE se monta un
 * router (el real o el stub 404). Sin él, la ruta caería en `protectedApi` y
 * respondería 401 en vez de 404 con la feature apagada.
 */
function fakeContainer(appleAuth: Container['appleAuth']): Container {
  const stub = { execute: vi.fn() };
  return {
    validarSesion: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'u' })),
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
    googleAuth: undefined,
    googleAuthMobile: undefined,
    appleAuth,
    loginRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    shutdown: async () => {},
    logger: { raw: {} },
  } as unknown as Container;
}

function stubAppleGraph(): NonNullable<Container['appleAuth']> {
  return {
    verificadorIdToken: {
      verificarIdToken: vi.fn().mockResolvedValue(
        Result.ok({
          sub: 's',
          email: 'a@b.cl',
          emailVerificado: true,
          emailPrivado: false,
        }),
      ),
    },
    loginConApple: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          token: 'tok',
          userId: 'user-1',
          expiresAt: new Date('2026-10-11T00:00:00.000Z'),
          esNuevoUsuario: false,
        }),
      ),
    },
    appleTokenRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
  } as unknown as NonNullable<Container['appleAuth']>;
}

describe('/api/auth/apple/token — activation seam', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });
  const body = { identityToken: 'a.b.c', nonce: 'n' };

  it('401 SIN x-api-key aunque la feature esté activa', async () => {
    const res = await request(
      createApp(fakeContainer(stubAppleGraph()), testEnv),
    )
      .post('/api/auth/apple/token')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('404 con x-api-key y SIN sesión cuando la feature está apagada', async () => {
    const res = await request(createApp(fakeContainer(undefined), testEnv))
      .post('/api/auth/apple/token')
      .set('x-api-key', KEY)
      .send(body);

    expect(res.status).toBe(404);
  });

  it('200 con x-api-key y SIN sesión cuando la feature está activa', async () => {
    const res = await request(
      createApp(fakeContainer(stubAppleGraph()), testEnv),
    )
      .post('/api/auth/apple/token')
      .set('x-api-key', KEY)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'tok',
      userId: 'user-1',
      expiresAt: '2026-10-11T00:00:00.000Z',
    });
  });
});
