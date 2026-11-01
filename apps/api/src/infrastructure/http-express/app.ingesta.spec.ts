import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { commitIngestaResponseSchema } from './schemas/ingesta-commit.schema';

/**
 * Gate de aislamiento para la ingesta (ADR-015, RNF-SEC-006). Upload autenticado:
 * la ruta queda detrás del router protegido (la auth corre ANTES de parsear el
 * archivo) y el userId de la sesión fluye al pipeline.
 */
const COMMIT_OK = {
  ingestaId: 'ing-1',
  totalTransacciones: 0,
  duplicadosOmitidos: 0,
  transacciones: [],
};

function fakeContainer(): Container {
  return {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: { execute: vi.fn() },
    calcularResumenAnual: { execute: vi.fn() },
    obtenerDetalleBucket: { execute: vi.fn() },
    obtenerMovimientosMes: { execute: vi.fn() },
    reclasificarTransaccion: { execute: vi.fn() },
    verificarConsentimientoCartolas: {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    },
    commitIngesta: {
      execute: vi.fn().mockResolvedValue(Result.ok(COMMIT_OK)),
    },
    eliminarIngesta: { execute: vi.fn() },
    listarIngestas: { execute: vi.fn().mockResolvedValue([]) },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('POST /api/ingestas/commit — cadena de auth + aislamiento', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 con api-key pero sin sesión (auth corre antes de parsear el archivo)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/ingestas/commit')
      .set('x-api-key', KEY)
      .attach('file', Buffer.from('x'), 'cartola.xlsx');
    expect(res.status).toBe(401);
  });

  it('201 con api-key + sesión; el userId de la sesión fluye al pipeline', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .post('/api/ingestas/commit')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(201);
    expect(c.commitIngesta.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-de-sesion' }),
    );
  });

  it('201: el body real cumple commitIngestaResponseSchema (garantía de sincronía, openapi-contract-express)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .post('/api/ingestas/commit')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(201);
    expect(() => commitIngestaResponseSchema.parse(res.body)).not.toThrow();
  });
});
