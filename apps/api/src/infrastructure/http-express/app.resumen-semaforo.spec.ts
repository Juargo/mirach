import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { EstadoSemaforo } from '../../domain/value-objects/estado-semaforo';
import { Bucket } from '../../domain/value-objects/bucket';
import type { SemaforoDetalle } from '../../domain/value-objects/semaforo-detalle';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { semaforoDetalleResponseSchema } from './schemas/semaforo-detalle.schema';

/**
 * GATE de Slice 5 (US-049, ADR-015, RNF-SEC-006/ISO-01/ISO-02): la cadena de
 * auth completa montada en la app real, y la prueba de aislamiento — el
 * `userId` que llega al use case es el DERIVADO DE LA SESIÓN, no una
 * constante fija. Mismo patrón hermético (fake container, sin DB) que
 * `app.resumen.spec.ts`.
 */
const SEMAFORO_DETALLE_OK: SemaforoDetalle = {
  totalIngreso: 1_500_000n,
  sinIngreso: false,
  estadoGlobal: EstadoSemaforo.Verde,
  diagnostico:
    'Tu veredicto del mes es Muy Saludable: los tres grupos están dentro de su rango.',
  bucketsCriticos: [],
  buckets: [
    {
      bucket: Bucket.Necesidades,
      total: 500_000n,
      porcentajeBp: 3333n,
      estadoSemaforo: EstadoSemaforo.Verde,
      bandas: {
        verdeMin: null,
        verdeMax: 5000n,
        amarilloMin: null,
        amarilloMax: 6000n,
        metaBp: 5000n,
      },
      consejo: null,
    },
    {
      bucket: Bucket.Deseos,
      total: 200_000n,
      porcentajeBp: 1333n,
      estadoSemaforo: EstadoSemaforo.Verde,
      bandas: {
        verdeMin: null,
        verdeMax: 3000n,
        amarilloMin: null,
        amarilloMax: 4000n,
        metaBp: 3000n,
      },
      consejo: null,
    },
    {
      bucket: Bucket.Ahorro,
      total: 300_000n,
      porcentajeBp: 2000n,
      estadoSemaforo: EstadoSemaforo.Verde,
      bandas: {
        verdeMin: 2000n,
        verdeMax: 4000n,
        amarilloMin: 1000n,
        amarilloMax: 5000n,
        metaBp: 2000n,
      },
      consejo: null,
    },
  ],
  sinCategoria: { cantidad: 0, total: 0n },
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
    obtenerSemaforoDetalle: {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ periodo: '2026-07', detalle: SEMAFORO_DETALLE_OK }),
        ),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/resumen/semaforo — cadena de auth + aislamiento (US-049)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 sin x-api-key (api-key middleware corta primero)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/resumen/semaforo')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(401);
  });

  it('401 con api-key pero sin sesión (session middleware)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/resumen/semaforo')
      .set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la SESIÓN fluye al use case (aislamiento)', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/resumen/semaforo')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerSemaforoDetalle.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      periodo: undefined,
    });
  });

  it('400 scrubbed en PeriodoInvalidoError (el input crudo no aparece en el body)', async () => {
    const c = fakeContainer();
    c.obtenerSemaforoDetalle.execute = vi
      .fn()
      .mockResolvedValue(Result.fail(new PeriodoInvalidoError('not-a-date')));

    const res = await request(createApp(c, testEnv))
      .get('/api/resumen/semaforo?periodo=not-a-date')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
  });

  it('el body 200 real cumple semaforoDetalleResponseSchema (garantía de sincronía)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/resumen/semaforo')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(() => semaforoDetalleResponseSchema.parse(res.body)).not.toThrow();
  });
});
