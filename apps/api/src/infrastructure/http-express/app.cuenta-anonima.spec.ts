import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Montaje de las rutas de cuenta anónima (ADR-013): el alta es session-public
 * (solo api-key) y la vinculación queda detrás del session middleware, con el
 * usuario tomado de la sesión.
 */
const SESION = {
  token: 'tok',
  userId: 'anon-1',
  expiresAt: new Date('2027-11-12T00:00:00.000Z'),
};

function limiter() {
  return {
    isBlocked: vi.fn().mockReturnValue(false),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  };
}

function fakeContainer(sesionValida: boolean) {
  const stub = { execute: vi.fn() };
  const container = {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(
          sesionValida
            ? Result.ok({ userId: 'anon-1', tokenHash: 'hash-anonimo' })
            : Result.fail(new SesionInvalidaError()),
        ),
    },
    login: stub,
    logout: stub,
    obtenerIdentidad: stub,
    googleAuth: undefined,
    appleAuth: undefined,
    googleAuthMobile: {
      verificadorIdToken: {
        verificarIdToken: vi
          .fn()
          .mockResolvedValue(
            Result.ok({ sub: 'g-1', email: null, emailVerificado: false }),
          ),
      },
    },
    crearCuentaAnonima: {
      execute: vi.fn().mockResolvedValue(Result.ok(SESION)),
    },
    vincularIdentidad: {
      execute: vi.fn().mockResolvedValue(Result.ok(SESION)),
    },
    altaAnonimaRateLimiter: limiter(),
    vincularRateLimiter: limiter(),
    loginRateLimiter: limiter(),
    shutdown: async () => {},
    logger: { raw: {} },
  };
  return container as unknown as Container & typeof container;
}

describe('rutas de cuenta anónima — montaje (ADR-013)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('POST /api/auth/anonimo: 401 sin x-api-key', async () => {
    const container = fakeContainer(false);

    const res = await request(createApp(container, testEnv))
      .post('/api/auth/anonimo')
      .send({});

    expect(res.status).toBe(401);
    expect(container.crearCuentaAnonima.execute).not.toHaveBeenCalled();
  });

  it('POST /api/auth/anonimo: 200 con x-api-key y SIN sesión', async () => {
    const res = await request(createApp(fakeContainer(false), testEnv))
      .post('/api/auth/anonimo')
      .set('x-api-key', KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('anon-1');
  });

  it.each(['apple', 'google'])(
    'POST /api/cuenta/vincular/%s: 401 SESION_INVALIDA sin sesión',
    async (proveedor) => {
      const container = fakeContainer(false);

      const res = await request(createApp(container, testEnv))
        .post(`/api/cuenta/vincular/${proveedor}`)
        .set('x-api-key', KEY)
        .send({ idToken: 'jwt', identityToken: 'jwt', nonce: 'n' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESION_INVALIDA');
      expect(container.vincularIdentidad.execute).not.toHaveBeenCalled();
    },
  );

  it('POST /api/cuenta/vincular/google: con sesión vincula al usuario y al hash de la SESIÓN', async () => {
    const container = fakeContainer(true);

    const res = await request(createApp(container, testEnv))
      .post('/api/cuenta/vincular/google')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer raw-token')
      .send({ idToken: 'jwt', userId: 'otro-usuario' });

    expect(res.status).toBe(200);
    expect(container.vincularIdentidad.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'anon-1',
        tokenHashActual: 'hash-anonimo',
      }),
    );
  });

  it('POST /api/cuenta/vincular/apple: 404 con sesión cuando Apple no está configurado', async () => {
    const res = await request(createApp(fakeContainer(true), testEnv))
      .post('/api/cuenta/vincular/apple')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer raw-token')
      .send({ identityToken: 'jwt', nonce: 'n' });

    expect(res.status).toBe(404);
  });
});
