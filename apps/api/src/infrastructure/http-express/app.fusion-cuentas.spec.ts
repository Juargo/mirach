import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Montaje de `POST /api/cuenta/fusionar` (ADR-014): queda detrás del session
 * middleware, exige x-api-key y toma el destino de la sesión.
 */
const RESUMEN = {
  cuentasMovidas: 0,
  cuentasUnidas: 1,
  movimientosMovidos: 2,
  duplicadosOmitidos: 3,
  categoriasMovidas: 0,
  patronesMovidos: 0,
};

function fakeContainer(sesionValida: boolean) {
  const stub = { execute: vi.fn() };
  const limiter = () => ({
    isBlocked: vi.fn().mockReturnValue(false),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  });
  const container = {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(
          sesionValida
            ? Result.ok({ userId: 'destino-1', tokenHash: 'hash-destino' })
            : Result.fail(new SesionInvalidaError()),
        ),
    },
    login: stub,
    logout: stub,
    obtenerIdentidad: stub,
    googleAuth: undefined,
    appleAuth: undefined,
    googleAuthMobile: undefined,
    crearCuentaAnonima: stub,
    vincularIdentidad: stub,
    fusionarCuenta: {
      execute: vi.fn().mockResolvedValue(Result.ok(RESUMEN)),
    },
    altaAnonimaRateLimiter: limiter(),
    vincularRateLimiter: limiter(),
    fusionarRateLimiter: limiter(),
    loginRateLimiter: limiter(),
    shutdown: async () => {},
    logger: { raw: {} },
  };
  return container as unknown as Container & typeof container;
}

describe('POST /api/cuenta/fusionar — montaje (ADR-014)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 SESION_INVALIDA sin sesión: no fusiona nada', async () => {
    const container = fakeContainer(false);

    const res = await request(createApp(container, testEnv))
      .post('/api/cuenta/fusionar')
      .set('x-api-key', KEY)
      .send({ tokenOrigen: 'tok' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESION_INVALIDA');
    expect(container.fusionarCuenta.execute).not.toHaveBeenCalled();
  });

  it('401 API_KEY_INVALIDA sin x-api-key', async () => {
    const container = fakeContainer(true);

    const res = await request(createApp(container, testEnv))
      .post('/api/cuenta/fusionar')
      .set('Authorization', 'Bearer raw-token')
      .send({ tokenOrigen: 'tok' });

    expect(res.status).toBe(401);
    expect(container.fusionarCuenta.execute).not.toHaveBeenCalled();
  });

  it('con sesión fusiona en el usuario de la SESIÓN, ignorando un userId del body', async () => {
    const container = fakeContainer(true);

    const res = await request(createApp(container, testEnv))
      .post('/api/cuenta/fusionar')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer raw-token')
      .send({ tokenOrigen: 'tok-origen', userId: 'otro-usuario' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(RESUMEN);
    expect(container.fusionarCuenta.execute).toHaveBeenCalledWith({
      destinoUserId: 'destino-1',
      tokenOrigen: 'tok-origen',
    });
  });
});
