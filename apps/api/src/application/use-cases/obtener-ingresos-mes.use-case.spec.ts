import {
  ObtenerIngresosMesUseCase,
  ObtenerIngresosMesResult,
  TransaccionIngresoMes,
} from './obtener-ingresos-mes.use-case';
import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../ports/detalle-bucket.port';
import { ILogger } from '../ports/logger.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// US-052 PR1: Unit tests — ObtenerIngresosMesUseCase (fake reader).
// 13 cases per design §5 ledger (MID-01..06). No DB, no infrastructure
// imports. Mirrors obtener-detalle-bucket-mes.use-case.spec.ts patterns.
// ──────────────────────────────────────────────────────────────────────────────

const makeRow = (
  overrides: Partial<DetalleBucketRow> = {},
): DetalleBucketRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-03T00:00:00.000Z'),
  descripcion: 'Sueldo',
  cargo: 0n,
  abono: 1500000n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  categoria: null,
  ...overrides,
});

function makeReaders(rows: DetalleBucketRow[]) {
  const findByPeriodoYBucket = vi.fn().mockResolvedValue(rows);
  const reader = { findByPeriodoYBucket } satisfies IDetalleBucketReader;
  return { reader, findByPeriodoYBucket };
}

function makeUseCase(
  readers: ReturnType<typeof makeReaders>,
  logger: ILogger = new NoOpLogger(),
): ObtenerIngresosMesUseCase {
  return new ObtenerIngresosMesUseCase(readers.reader, logger);
}

/** Serializa sin reventar por BigInt — espeja el patrón del spec hermano. */
const conBigInts = (valor: unknown): string =>
  JSON.stringify(valor, (_clave, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  );

/**
 * Assert de IGUALDAD TIPO-A-TIPO (MID-03/MID-06, gate PR1): la proyección y el
 * resultado expuestos por el use case deben tener EXACTAMENTE estas teclas —
 * si mañana alguien agrega `tipoCuenta`/`numeroCuenta`/`meta` al tipo, `Equal`
 * resuelve a `false` y esta constante deja de compilar.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type EsperadoTransaccion = {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly origen: string;
  readonly monto: bigint;
};

type EsperadoResultado = {
  readonly total: bigint;
  readonly conteo: number;
  readonly transacciones: ReadonlyArray<EsperadoTransaccion>;
};

const _assertFilaSinPII: Equal<
  TransaccionIngresoMes,
  EsperadoTransaccion
> extends true
  ? true
  : never = true;
const _assertResultadoSinPII: Equal<
  ObtenerIngresosMesResult,
  EsperadoResultado
> extends true
  ? true
  : never = true;

describe('ObtenerIngresosMesUseCase', () => {
  describe('header assembly (MID-01)', () => {
    it('mes sin ingresos → ok: total 0n, conteo 0, transacciones [] (nunca error)', async () => {
      const readers = makeReaders([]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(0n);
      expect(header.conteo).toBe(0);
      expect(header.transacciones).toEqual([]);
    });
  });

  describe('montos BigInt exactos (MID-05 / CA-05)', () => {
    it('Σ abono exacta más allá de MAX_SAFE_INTEGER — sin pérdida de precisión', async () => {
      const readers = makeReaders([
        makeRow({ id: 'tx-a', abono: 9007199254740991n }), // MAX_SAFE_INTEGER
        makeRow({ id: 'tx-b', abono: 9007199254740992n }), // MAX_SAFE_INTEGER + 1
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      // 9007199254740991 + 9007199254740992 = 18014398509481983 (imposible
      // de representar como Number — Number() daría 18014398509481984).
      expect(header.total).toBe(18014398509481983n);
      expect(String(header.total)).toBe('18014398509481983');
      // Header con filas reales: conteo = rows.length (MID-01).
      expect(header.conteo).toBe(2);
      expect(header.transacciones).toHaveLength(2);
      // Cada monto también es exacto más allá del límite seguro.
      expect(header.transacciones[0].monto).toBe(9007199254740991n);
      expect(header.transacciones[1].monto).toBe(9007199254740992n);
    });

    it('monto = abono positivo, nunca cargo (el use case NO re-aplica regla de signo)', async () => {
      // Una fila SPEND (cargo > 0 ∧ abono > 0) jamás llega a bucket-ingreso
      // (el reader filtra); si llegara, el contrato del use case suma/proyecta
      // SOLO abono — la regla esIngreso vive en el bucket filter, no acá (D-01).
      const readers = makeReaders([
        makeRow({ id: 'tx-a', cargo: 40000n, abono: 300000n }),
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(300000n); // Σ abono — el cargo no suma
      expect(header.transacciones[0].monto).toBe(300000n); // positivo, sin '-'
      expect(String(header.transacciones[0].monto)).toBe('300000');
    });
  });

  describe('orden del reader preservado (MID-01)', () => {
    it('fecha asc, id asc (tie-break) — el use case NO re-ordena', async () => {
      const readers = makeReaders([
        // Día 15 con tie-break: tx-a debe ir antes que tx-b (id asc).
        makeRow({ id: 'tx-b', fecha: new Date('2026-07-15T00:00:00.000Z') }),
        makeRow({ id: 'tx-a', fecha: new Date('2026-07-15T00:00:00.000Z') }),
        makeRow({ id: 'tx-c', fecha: new Date('2026-07-03T00:00:00.000Z') }),
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      // El reader ya entrega fecha asc, id asc; el use case preserva el orden
      // tal cual (el fixture está DELIBERADAMENTE desordenado de entrada).
      expect(result.getValue().transacciones.map((t) => t.id)).toEqual([
        'tx-b',
        'tx-a',
        'tx-c',
      ]);
    });
  });

  describe('periodo resolution (MID-04)', () => {
    it('periodo ausente → PeriodoMes.actual() pasado al reader (mes UTC actual)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const readers = makeReaders([makeRow({ id: 'tx-a', abono: 100000n })]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: undefined,
      });

      expect(result.isOk()).toBe(true);
      expect(readers.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      const periodoRecibido = readers.findByPeriodoYBucket.mock.calls[0][1];
      expect(periodoRecibido.valor).toBe(expectedPeriodo);
    });

    it('periodo inválido → Result.fail(PeriodoInvalidoError), reader NO llamado, sin throw', async () => {
      const readers = makeReaders([]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-13',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(result.getError().rawValue).toBe('2026-13');
      expect(readers.findByPeriodoYBucket).not.toHaveBeenCalled();
    });

    it('periodo válido → fluye resuelto como PeriodoMes al reader', async () => {
      const readers = makeReaders([]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      expect(readers.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      const periodoRecibido = readers.findByPeriodoYBucket.mock.calls[0][1];
      expect(periodoRecibido.valor).toBe('2026-07');
    });
  });

  describe('userId isolation (RNF-SEC-006 / MID-06)', () => {
    it('userId fluye verbatim al reader', async () => {
      const readers = makeReaders([]);
      const uc = makeUseCase(readers);

      await uc.execute({
        userId: 'user-xyz-789',
        periodo: '2026-07',
      });

      expect(readers.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      expect(readers.findByPeriodoYBucket.mock.calls[0][0]).toBe(
        'user-xyz-789',
      );
    });

    it('reader llamado con Bucket.Ingreso — el bucket filter codifica esIngreso, sin regla de signo duplicada (D-01)', async () => {
      const readers = makeReaders([]);
      const uc = makeUseCase(readers);

      await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(readers.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      expect(readers.findByPeriodoYBucket.mock.calls[0][2]).toBe(
        Bucket.Ingreso,
      );
    });
  });

  describe('origen (MID-02 / CA-02)', () => {
    it('banco verbatim, sin normalización', async () => {
      const readers = makeReaders([
        makeRow({ id: 'tx-a', banco: 'BancoEstado' }),
        makeRow({ id: 'tx-b', banco: 'Santander' }),
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const filas = result.getValue().transacciones;
      expect(filas[0].origen).toBe('BancoEstado');
      expect(filas[1].origen).toBe('Santander');
    });

    it("banco vacío → 'Manual' (rama dead-code de MID-02, unit-proven)", async () => {
      const readers = makeReaders([
        makeRow({ id: 'tx-a', banco: '', tipoCuenta: 'Manual' }),
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().transacciones[0].origen).toBe('Manual');
    });
  });

  describe('PII-trim y ausencia de meta/porcentaje/estado (MID-03 / MID-06)', () => {
    it('la proyección NO contiene banco/tipoCuenta/numeroCuenta/cargo/abono ni meta/porcentaje/estado — ni en tipos ni en runtime', async () => {
      const readers = makeReaders([
        makeRow({
          id: 'tx-a',
          banco: 'BancoEstado',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: '12345678',
        }),
        makeRow({ id: 'tx-b', banco: 'Santander' }),
      ]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();

      // IGUALDAD EXACTA tipo-a-tipo (asserts de tipo arriba: Equal<T, Esperado>).
      expect(header.transacciones[0]).toEqual({
        id: 'tx-a',
        fecha: new Date('2026-07-03T00:00:00.000Z'),
        descripcion: 'Sueldo',
        origen: 'BancoEstado',
        monto: 1500000n,
      });

      const serializado = conBigInts(header);
      expect(serializado).not.toContain('banco');
      expect(serializado).not.toContain('tipoCuenta');
      expect(serializado).not.toContain('numeroCuenta');
      expect(serializado).not.toContain('cargo');
      expect(serializado).not.toContain('abono');
      expect(serializado).not.toContain('Cuenta Corriente');
      expect(serializado).not.toContain('12345678');
      // MID-03: ni meta/porcentaje/estado en el top level ni en las filas.
      expect(serializado).not.toContain('meta');
      expect(serializado).not.toContain('porcentaje');
      expect(serializado).not.toContain('estado');
      expect(serializado).not.toContain('periodo');
    });
  });

  describe('debug logging (ADR-013 — redaction contract)', () => {
    it('logger.debug recibe solo conteos — nunca montos del fixture', async () => {
      const readers = makeReaders([
        makeRow({ id: 'tx-a', abono: 1500000n }),
        makeRow({ id: 'tx-b', abono: 9999999n }),
      ]);
      const logger = new FakeLogger();
      const uc = makeUseCase(readers, logger);

      await uc.execute({
        userId: 'user-a',
        periodo: '2026-07',
      });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      // Montos del fixture y PII jamás logueados — solo conteos.
      expect(serializedContexts).not.toContain('1500000');
      expect(serializedContexts).not.toContain('9999999');
      expect(serializedContexts).not.toContain('Sueldo');
      expect(serializedContexts).not.toContain('12345678');
    });
  });
});
