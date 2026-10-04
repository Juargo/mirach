import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { ListarPeriodosConDatosUseCase } from '../../application/use-cases/listar-periodos-con-datos.use-case';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { periodosResponseSchema } from './schemas/periodos.schema';
import { API_KEY_INVALIDA } from './auth-error-codes';

/**
 * GET /api/periodos — cadena de auth completa montada en la app real (fake
 * container, sin DB). El `userId` que llega al use case es el de la SESIÓN
 * (RNF-SEC-006).
 */
function fakeContainer(
  periodos: readonly string[] = ['2026-07', '2026-05'],
): Container {
  return {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    listarPeriodosConDatos: {
      execute: vi.fn().mockResolvedValue(periodos),
    } as unknown as ListarPeriodosConDatosUseCase,
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/periodos', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 API_KEY_INVALIDA sin x-api-key', async () => {
    const res = await request(createApp(fakeContainer(), testEnv)).get(
      '/api/periodos',
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(API_KEY_INVALIDA);
  });

  it('401 SESION_INVALIDA con api-key pero sin sesión', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/periodos')
      .set('x-api-key', KEY);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESION_INVALIDA');
  });

  it('200 { periodos } y el userId de la SESIÓN llega al use case', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/periodos')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(periodosResponseSchema.parse(res.body)).toEqual({
      periodos: ['2026-07', '2026-05'],
    });
    expect(c.listarPeriodosConDatos.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
    });
  });

  it('200 con lista vacía cuando no hay movimientos', async () => {
    const res = await request(createApp(fakeContainer([]), testEnv))
      .get('/api/periodos')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ periodos: [] });
  });
});
