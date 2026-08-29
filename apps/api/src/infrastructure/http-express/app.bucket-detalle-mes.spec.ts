import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import type { ObtenerDetalleBucketMesResult } from '../../application/use-cases/obtener-detalle-bucket-mes.use-case';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { bucketDetalleMesResponseSchema } from './schemas/bucket-detalle-mes.schema';

/**
 * GATE de aislamiento para GET /api/buckets/:bucket/detalle (US-051,
 * ADR-015, RNF-SEC-006/ISO-01/ISO-02, MBD-06): la cadena de auth completa
 * montada en la app real y la prueba de aislamiento — el `userId` que llega
 * al use case es el DERIVADO DE LA SESIÓN, no una constante fija. Mismo
 * patrón hermético (fake container, sin DB) que `app.resumen-semaforo.spec.ts`
 * y `app.buckets.spec.ts` (design §4 ledger, 6 casos).
 *
 * Es la suite RED sancionada para las rutas de PR3 (tasks.md 4.1): si algún
 * caso falla aquí, es un gap de PR1–3 que se arregla ALLÍ, no en esta suite.
 */
const DETALLE_MES_OK: ObtenerDetalleBucketMesResult = {
  periodo: '2026-07',
  bucket: Bucket.Necesidades,
  total: 250_000n,
  totalTransacciones: 5,
  totalCategorias: 2,
  porcentajeBp: 1667n,
  metaBp: 5000n,
  grupos: [
    {
      categoriaId: 'cat-comida',
      nombre: 'Comida',
      subtotal: 150_000n,
      conteo: 3,
      transacciones: [
        {
          id: 'tx-1',
          fecha: new Date('2026-07-03T00:00:00.000Z'),
          descripcion: 'Jumbo',
          origen: 'BCI',
          monto: 90_000n,
        },
        {
          id: 'tx-2',
          fecha: new Date('2026-07-10T00:00:00.000Z'),
          descripcion: 'Santa Isabel',
          origen: 'BCI',
          monto: 40_000n,
        },
        {
          id: 'tx-3',
          fecha: new Date('2026-07-15T00:00:00.000Z'),
          descripcion: 'Mercado',
          origen: 'Manual',
          monto: 20_000n,
        },
      ],
    },
    {
      categoriaId: null,
      nombre: 'Sin categoría',
      subtotal: 100_000n,
      conteo: 2,
      transacciones: [
        {
          id: 'tx-4',
          fecha: new Date('2026-07-18T00:00:00.000Z'),
          descripcion: 'Giro',
          origen: 'BCI',
          monto: 60_000n,
        },
        {
          id: 'tx-5',
          fecha: new Date('2026-07-21T00:00:00.000Z'),
          descripcion: 'Cuota',
          origen: 'Manual',
          monto: 40_000n,
        },
      ],
    },
  ],
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
    obtenerDetalleBucketMes: {
      execute: vi.fn().mockResolvedValue(Result.ok(DETALLE_MES_OK)),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/buckets/:bucket/detalle — cadena de auth + aislamiento (US-051)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 sin x-api-key (api-key middleware corta primero)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/buckets/Necesidades/detalle')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(401);
  });

  it('401 con api-key pero sin sesión (queda detrás del session middleware)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/buckets/Necesidades/detalle')
      .set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la SESIÓN fluye al use case (aislamiento, MBD-06)', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/buckets/Necesidades/detalle')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerDetalleBucketMes.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      bucket: 'Necesidades',
      periodo: undefined,
    });
  });

  it('400 scrubbed en PeriodoInvalidoError (MBD-04 — el input crudo no aparece en el body)', async () => {
    const c = fakeContainer();
    c.obtenerDetalleBucketMes.execute = vi
      .fn()
      .mockResolvedValue(Result.fail(new PeriodoInvalidoError('not-a-date')));

    const res = await request(createApp(c, testEnv))
      .get('/api/buckets/Necesidades/detalle?periodo=not-a-date')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
  });

  it('400 scrubbed en BucketInvalidoError (MBD-07 — Ingreso fuera de alcance, raw ausente del body)', async () => {
    const c = fakeContainer();
    c.obtenerDetalleBucketMes.execute = vi
      .fn()
      .mockResolvedValue(Result.fail(new BucketInvalidoError('Ingresos')));

    const res = await request(createApp(c, testEnv))
      .get('/api/buckets/Ingresos/detalle')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('Ingresos');
    // El mensaje lista la allowlist de 4 buckets de gasto (D-07).
    expect(JSON.stringify(res.body)).toContain('Necesidades');
    expect(JSON.stringify(res.body)).toContain('SinCategoria');
  });

  it('el body 200 real cumple bucketDetalleMesResponseSchema (garantía de sincronía DTO↔schema)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/buckets/Necesidades/detalle')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    const parsed = bucketDetalleMesResponseSchema.parse(res.body);
    // Valores concretos del fixture — el parse por sí solo no prueba mapping.
    expect(parsed.total).toBe('250000');
    expect(parsed.totalTransacciones).toBe(5);
    expect(parsed.totalCategorias).toBe(2);
    expect(parsed.porcentajeBp).toBe(1667);
    expect(parsed.metaBp).toBe(5000);
    expect(parsed.grupos.map((g) => g.nombre)).toEqual([
      'Comida',
      'Sin categoría',
    ]);
    const sumaConteos = parsed.grupos.reduce(
      (acumulado, grupo) => acumulado + grupo.conteo,
      0,
    );
    expect(sumaConteos).toBe(parsed.totalTransacciones);
  });
});
