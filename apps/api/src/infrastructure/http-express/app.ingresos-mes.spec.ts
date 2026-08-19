import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import {
  ObtenerIngresosMesUseCase,
  type ObtenerIngresosMesResult,
} from '../../application/use-cases/obtener-ingresos-mes.use-case';
import type { IDetalleBucketReader } from '../../application/ports/detalle-bucket.port';
import type { ILogger } from '../../application/ports/logger.port';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { ingresosMesResponseSchema } from './schemas/ingresos-mes.schema';

/**
 * GATE de aislamiento para GET /api/ingresos/mes (US-052, ADR-015,
 * RNF-SEC-006/ISO-01/ISO-02, MID-06): la cadena de auth completa montada en
 * la app real y la prueba de aislamiento — el `userId` que llega al use case
 * es el DERIVADO DE LA SESIÓN, no una constante fija. Mismo patrón hermético
 * (fake container, sin DB) que `app.bucket-detalle-mes.spec.ts` (design §5
 * ledger, 6 casos).
 *
 * Es la suite RED sancionada para las rutas de PR3 (tasks.md 4.1): si algún
 * caso falla aquí, es un gap de PR1–3 que se arregla ALLÍ, no en esta suite.
 *
 * PR3 gate note: a diferencia de los fakes de specs hermanos (que usan
 * `as unknown as Container` SIN poblar el campo), este fake SÍ puebla
 * `obtenerIngresosMes` — el mount de la ruta en app.ts lo resuelve en
 * runtime, así que un fake que lo deje `undefined` rompería con 500, no con
 * la señal de aislamiento que esta suite quiere medir.
 */
const INGRESOS_MES_OK: ObtenerIngresosMesResult = {
  total: 3_000_000n,
  conteo: 3,
  transacciones: [
    {
      id: 'tx-a',
      fecha: new Date('2026-07-03T00:00:00.000Z'),
      descripcion: 'Sueldo',
      origen: 'BCI',
      monto: 1_500_000n,
    },
    {
      id: 'tx-b',
      fecha: new Date('2026-07-15T00:00:00.000Z'),
      descripcion: 'Freelance',
      origen: 'BancoEstado',
      monto: 900_000n,
    },
    {
      id: 'tx-c',
      fecha: new Date('2026-07-21T00:00:00.000Z'),
      descripcion: 'Transferencia',
      origen: 'Santander',
      monto: 600_000n,
    },
  ],
};

function fakeReader(
  filas: Array<{
    id: string;
    fecha: Date;
    descripcion: string;
    abono: bigint;
    banco: string;
  }>,
): IDetalleBucketReader {
  return {
    findByPeriodoYBucket: vi.fn().mockResolvedValue(
      filas.map((fila) => ({
        id: fila.id,
        fecha: fila.fecha,
        descripcion: fila.descripcion,
        cargo: 0n,
        abono: fila.abono,
        banco: fila.banco,
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-1',
        categoria: null,
      })),
    ),
  };
}

function fakeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeContainer(
  useCase: Pick<ObtenerIngresosMesUseCase, 'execute'> = {
    execute: vi.fn().mockResolvedValue(Result.ok(INGRESOS_MES_OK)),
  },
): Container {
  return {
    validarSesion: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: { execute: vi.fn() },
    calcularResumenAnual: { execute: vi.fn() },
    obtenerDetalleBucket: { execute: vi.fn() },
    obtenerDetalleBucketMes: { execute: vi.fn() },
    // PR3 gate: el fake POBLA el campo que el mount de la ruta resuelve.
    obtenerIngresosMes: useCase as unknown as ObtenerIngresosMesUseCase,
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/ingresos/mes — cadena de auth + aislamiento (US-052)', () => {
  const KEY = 'k'.repeat(64);
  const testEnv = buildTestEnv({ API_KEY: KEY });

  it('401 sin x-api-key (api-key middleware corta primero)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/ingresos/mes')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(401);
  });

  it('401 con api-key pero sin sesión (queda detrás del session middleware)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/ingresos/mes')
      .set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la SESIÓN fluye al use case (aislamiento, MID-06)', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c, testEnv))
      .get('/api/ingresos/mes')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerIngresosMes.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      periodo: undefined,
    });
  });

  it('400 scrubbed en PeriodoInvalidoError (MID-04 — el input crudo no aparece en el body)', async () => {
    const c = fakeContainer();
    c.obtenerIngresosMes.execute = vi
      .fn()
      .mockResolvedValue(Result.fail(new PeriodoInvalidoError('not-a-date')));

    const res = await request(createApp(c, testEnv))
      .get('/api/ingresos/mes?periodo=not-a-date')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('not-a-date');
    // Prueba que el 400 viene del DOMINIO (PeriodoInvalidoError), no del
    // schema de transporte ('Parámetros de consulta inválidos.').
    expect(JSON.stringify(res.body)).toContain('El período no es válido');
  });

  it('el body 200 real cumple ingresosMesResponseSchema (garantía de sincronía DTO↔schema)', async () => {
    const res = await request(createApp(fakeContainer(), testEnv))
      .get('/api/ingresos/mes')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    const parsed = ingresosMesResponseSchema.parse(res.body);
    // Valores concretos del fixture — el parse por sí solo no prueba mapping.
    expect(parsed.total).toBe('3000000');
    expect(parsed.conteo).toBe(3);
    // MID-03: EXACTAMENTE {total, conteo, transacciones} — sin
    // meta/porcentaje/estado/periodo en NINGÚN nivel (el .strict() ya los
    // rechazaría; esto además prueba que la ruta no los emitió).
    expect(Object.keys(parsed).sort()).toEqual([
      'conteo',
      'total',
      'transacciones',
    ]);
    // Las TRES transacciones del fixture mapean 1:1 al wire (id, fecha
    // ISO-8601 UTC, descripcion, origen, monto) — no solo la primera.
    expect(parsed.transacciones).toEqual([
      {
        id: 'tx-a',
        fecha: '2026-07-03T00:00:00.000Z',
        descripcion: 'Sueldo',
        origen: 'BCI',
        monto: '1500000',
      },
      {
        id: 'tx-b',
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Freelance',
        origen: 'BancoEstado',
        monto: '900000',
      },
      {
        id: 'tx-c',
        fecha: '2026-07-21T00:00:00.000Z',
        descripcion: 'Transferencia',
        origen: 'Santander',
        monto: '600000',
      },
    ]);
  });

  it('ramas Manual del use case real via fake reader — banco vacío → origen "Manual" en el wire (MID-02 dead-code proof)', async () => {
    // Use case REAL con reader fake (mismo patrón que el spec del use case):
    // `banco: ''` cae a la rama `|| 'Manual'` y la cadena completa
    // (route → use case → DTO → schema) la expone verbatim.
    const reader = fakeReader([
      {
        id: 'tx-manual',
        fecha: new Date('2026-07-05T00:00:00.000Z'),
        descripcion: 'Efectivo',
        abono: 50_000n,
        banco: '',
      },
      {
        id: 'tx-banco',
        fecha: new Date('2026-07-08T00:00:00.000Z'),
        descripcion: 'Sueldo',
        abono: 1_000_000n,
        banco: 'BancoEstado',
      },
    ]);
    const c = fakeContainer(
      new ObtenerIngresosMesUseCase(reader, fakeLogger()),
    );

    const res = await request(createApp(c, testEnv))
      .get('/api/ingresos/mes')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    const parsed = ingresosMesResponseSchema.parse(res.body);
    expect(parsed.total).toBe('1050000');
    expect(parsed.conteo).toBe(2);
    expect(parsed.transacciones.map((t) => t.origen)).toEqual([
      'Manual',
      'BancoEstado',
    ]);
    // El reader fake fue consultado con el userId de la sesión y Bucket.Ingreso
    // (MID-06 + D-01) — la rama dead-code se probó con la cadena real.
    expect(reader.findByPeriodoYBucket).toHaveBeenCalledWith(
      'user-de-sesion',
      expect.anything(),
      Bucket.Ingreso,
    );
  });
});
