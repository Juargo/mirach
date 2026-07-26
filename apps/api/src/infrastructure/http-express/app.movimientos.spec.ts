import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Gate de aislamiento para movimientos (ADR-015, RNF-SEC-006). Lista de
 * transacciones — dato sensible — así que se prueba explícito que la ruta queda
 * detrás del router protegido y que el userId de la sesión fluye al use case.
 */
function fakeContainer(): Container {
  return {
    validarSesion: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: { execute: vi.fn() },
    calcularResumenAnual: { execute: vi.fn() },
    obtenerDetalleBucket: { execute: vi.fn() },
    obtenerMovimientosMes: {
      execute: vi.fn().mockResolvedValue(Result.ok({ periodo: '2026-07', transacciones: [] })),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/movimientos — cadena de auth + aislamiento', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 con api-key pero sin sesión (queda detrás del session middleware)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv)).get('/api/movimientos').set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la sesión fluye al use case', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/movimientos')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerMovimientosMes.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      periodo: undefined,
    });
  });
});
