import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { Categoria } from '../../domain/value-objects/categoria';
import type { Container } from '../../composition/container';

/**
 * Gate de aislamiento para la reclasificación (ADR-015, RNF-SEC-006). Escritura:
 * se prueba que la ruta queda detrás del router protegido y que el userId de la
 * sesión fluye al use case (la propiedad de la transacción se resuelve ahí →
 * 404 anti-enumeración si es de otro usuario).
 */
function fakeContainer(): Container {
  return {
    validarSesion: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: { execute: vi.fn() },
    calcularResumenAnual: { execute: vi.fn() },
    obtenerDetalleBucket: { execute: vi.fn() },
    obtenerMovimientosMes: { execute: vi.fn() },
    reclasificarTransaccion: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({ id: 'tx-1', categoria: Categoria.Supermercado, bucket: 'Necesidades' }),
      ),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('PATCH /api/transacciones/:id/categoria — cadena de auth + aislamiento', () => {
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
      .patch('/api/transacciones/tx-1/categoria')
      .set('x-api-key', KEY)
      .send({ categoria: 'Supermercado' });
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la sesión fluye al use case', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c))
      .patch('/api/transacciones/tx-1/categoria')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .send({ categoria: 'Supermercado' });

    expect(res.status).toBe(200);
    expect(c.reclasificarTransaccion.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      transaccionId: 'tx-1',
      categoria: 'Supermercado',
    });
  });
});
