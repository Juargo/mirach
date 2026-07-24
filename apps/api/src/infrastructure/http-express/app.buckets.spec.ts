import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';

/**
 * Gate de aislamiento para buckets (ADR-015, RNF-SEC-006). `buckets` expone
 * transacciones — dato más sensible que el resumen agregado — así que se prueba
 * explícito que la ruta cuelga del router protegido y que el userId de la sesión
 * fluye al use case.
 */
function fakeContainer(): Container {
  return {
    validarSesion: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: { execute: vi.fn() },
    calcularResumenAnual: { execute: vi.fn() },
    obtenerDetalleBucket: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({ periodo: '2026-07', bucket: 'Necesidades', transacciones: [] }),
      ),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/buckets/:bucket — cadena de auth + aislamiento', () => {
  const KEY = 'k'.repeat(64);
  const original = process.env.API_KEY;

  beforeEach(() => {
    process.env.API_KEY = KEY;
  });
  afterEach(() => {
    process.env.API_KEY = original;
  });

  it('401 con api-key pero sin sesión (queda detrás del session middleware)', async () => {
    const res = await request(createApp(fakeContainer()))
      .get('/api/buckets/Necesidades')
      .set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la sesión fluye al use case', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c))
      .get('/api/buckets/Necesidades')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerDetalleBucket.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      bucket: 'Necesidades',
      periodo: undefined,
    });
  });
});
