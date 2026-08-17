import { ObtenerDetalleBucketMesUseCase } from './obtener-detalle-bucket-mes.use-case';
import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../ports/detalle-bucket.port';
import { IResumenMesReader, BucketSumRow } from '../ports/resumen-mes.port';
import { ILogger } from '../ports/logger.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { porcentajeBasisPoints } from '../../domain/value-objects/resumen-mes';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// US-051 PR1: Unit tests — ObtenerDetalleBucketMesUseCase (mocked readers).
// 12 cases per tasks.md 1.3 (11 ledger + W-2). No DB, no infrastructure
// imports. Mirrors obtener-semaforo-detalle.use-case.spec.ts patterns.
// ──────────────────────────────────────────────────────────────────────────────

const NOMBRE_SIN_CATEGORIA = 'Sin categoría';

const makeRow = (
  overrides: Partial<DetalleBucketRow> = {},
): DetalleBucketRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-03T00:00:00.000Z'),
  descripcion: 'Compra supermercado',
  cargo: 50000n,
  abono: 0n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  categoria: null,
  ...overrides,
});

/** Fila del resumen del mes para el bucket Ingreso (base del % vs meta, D-02). */
const incomeRow = (totalAbono: bigint): BucketSumRow => ({
  bucket: Bucket.Ingreso,
  totalCargo: 0n,
  totalAbono,
  cantidadCargos: 0,
});

function makeReaders(rows: DetalleBucketRow[], resumenRows: BucketSumRow[]) {
  return {
    reader: {
      findByPeriodoYBucket: vi.fn().mockResolvedValue(rows),
    } satisfies IDetalleBucketReader,
    resumenReader: {
      sumarPorBucket: vi.fn().mockResolvedValue(resumenRows),
    } satisfies IResumenMesReader,
  };
}

function makeUseCase(
  readers: ReturnType<typeof makeReaders>,
  logger: ILogger = new NoOpLogger(),
): ObtenerDetalleBucketMesUseCase {
  return new ObtenerDetalleBucketMesUseCase(
    readers.reader,
    readers.resumenReader,
    logger,
  );
}

describe('ObtenerDetalleBucketMesUseCase', () => {
  describe('bucket allowlist (D-08)', () => {
    it.each([
      [Bucket.Necesidades, 5000n],
      [Bucket.Deseos, 3000n],
      [Bucket.Ahorro, 2000n],
      [Bucket.SinCategoria, null],
    ])(
      'acepta %s y expone su metaBp de BANDAS_SEMAFORO (%s)',
      async (bucket, metaBp) => {
        const readers = makeReaders([], []);
        const uc = makeUseCase(readers);

        const result = await uc.execute({
          userId: 'user-a',
          bucket,
          periodo: '2026-07',
        });

        expect(result.isOk()).toBe(true);
        expect(result.getValue().bucket).toBe(bucket);
        expect(result.getValue().metaBp).toBe(metaBp);
      },
    );

    it('Ingreso → Result.fail(BucketInvalidoError), ningún reader llamado (US-052 fuera de alcance)', async () => {
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Ingreso,
        periodo: '2026-07',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketInvalidoError);
      expect(readers.reader.findByPeriodoYBucket).not.toHaveBeenCalled();
      expect(readers.resumenReader.sumarPorBucket).not.toHaveBeenCalled();
    });

    it('bucket desconocido → Result.fail(BucketInvalidoError), ningún reader llamado', async () => {
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: 'no-existe',
        periodo: '2026-07',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketInvalidoError);
      expect(readers.reader.findByPeriodoYBucket).not.toHaveBeenCalled();
      expect(readers.resumenReader.sumarPorBucket).not.toHaveBeenCalled();
    });
  });

  describe('periodo resolution (MBD-04)', () => {
    it('periodo ausente → PeriodoMes.actual() (mes UTC actual)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: undefined,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe(expectedPeriodo);
    });

    it('periodo inválido → Result.fail(PeriodoInvalidoError), ningún reader llamado', async () => {
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-13',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(readers.reader.findByPeriodoYBucket).not.toHaveBeenCalled();
      expect(readers.resumenReader.sumarPorBucket).not.toHaveBeenCalled();
    });

    it('periodo válido → fluye resuelto como PeriodoMes a AMBOS readers', async () => {
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      expect(readers.reader.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      expect(readers.resumenReader.sumarPorBucket).toHaveBeenCalledTimes(1);
      const periodoRows = vi.mocked(readers.reader.findByPeriodoYBucket).mock
        .calls[0][1];
      const periodoResumen = vi.mocked(readers.resumenReader.sumarPorBucket)
        .mock.calls[0][1];
      expect(periodoRows.valor).toBe('2026-07');
      expect(periodoResumen.valor).toBe('2026-07');
    });
  });

  describe('userId isolation (RNF-SEC-006)', () => {
    it('userId fluye verbatim a AMBOS readers', async () => {
      const readers = makeReaders([], []);
      const uc = makeUseCase(readers);

      await uc.execute({
        userId: 'user-xyz-789',
        bucket: Bucket.Ahorro,
        periodo: '2026-07',
      });

      const userIdRows = vi.mocked(readers.reader.findByPeriodoYBucket).mock
        .calls[0][0];
      const userIdResumen = vi.mocked(readers.resumenReader.sumarPorBucket).mock
        .calls[0][0];
      expect(userIdRows).toBe('user-xyz-789');
      expect(userIdResumen).toBe('user-xyz-789');
    });
  });

  describe('header assembly (MBD-01)', () => {
    it('mes vacío con ingresos → Result.ok: total 0n, 0 transacciones, 0 categorías, grupos []', async () => {
      const readers = makeReaders([], [incomeRow(1500000n)]);
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(0n);
      expect(header.totalTransacciones).toBe(0);
      expect(header.totalCategorias).toBe(0);
      expect(header.grupos).toEqual([]);
      expect(header.porcentajeBp).toBe(0n);
      expect(header.metaBp).toBe(5000n);
    });

    it('mes sin ingresos, bucket real → porcentajeBp null, metaBp presente (base 0 → sin %)', async () => {
      const readers = makeReaders(
        [
          makeRow({
            id: 'tx-1',
            cargo: 50000n,
            categoria: { id: 'cat-comida', nombre: 'Comida' },
          }),
        ],
        [],
      );
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(50000n);
      expect(header.totalTransacciones).toBe(1);
      expect(header.porcentajeBp).toBeNull();
      expect(header.metaBp).toBe(5000n);
    });

    it('SinCategoria → porcentajeBp null y metaBp null, totalCategorias 1 (grupo sintético)', async () => {
      const readers = makeReaders(
        [
          makeRow({ id: 'tx-1', cargo: 40000n, categoria: null }),
          makeRow({ id: 'tx-2', cargo: 60000n, categoria: null }),
        ],
        [incomeRow(1500000n)],
      );
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.SinCategoria,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(100000n);
      expect(header.totalCategorias).toBe(1);
      expect(header.porcentajeBp).toBeNull();
      expect(header.metaBp).toBeNull();
      expect(header.grupos[0].categoriaId).toBeNull();
      expect(header.grupos[0].nombre).toBe(NOMBRE_SIN_CATEGORIA);
    });
  });

  describe('W-2 gate: mes lleno, header contra la meta (MBD-01 + MBD-05)', () => {
    it('total 250000 con ingresos 1 500 000 → porcentajeBp 1667 (no 1666), === porcentajeBasisPoints(total, ingreso)', async () => {
      // Ingreso base explícito en los datos de prueba: 1 500 000 CLP.
      const readers = makeReaders(
        [
          makeRow({
            id: 'tx-1',
            cargo: 50000n,
            categoria: { id: 'cat-comida', nombre: 'Comida' },
          }),
          makeRow({
            id: 'tx-2',
            cargo: 60000n,
            categoria: { id: 'cat-comida', nombre: 'Comida' },
          }),
          makeRow({
            id: 'tx-3',
            cargo: 40000n,
            categoria: { id: 'cat-comida', nombre: 'Comida' },
          }),
          makeRow({ id: 'tx-4', cargo: 40000n, categoria: null }),
          makeRow({ id: 'tx-5', cargo: 60000n, categoria: null }),
        ],
        [incomeRow(1500000n)],
      );
      const uc = makeUseCase(readers);

      const result = await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const header = result.getValue();
      expect(header.total).toBe(250000n);
      expect(header.totalTransacciones).toBe(5);
      expect(header.totalCategorias).toBe(2);
      expect(header.metaBp).toBe(5000n);
      // 250000 / 1500000 = 166.666… % → 1666.666… bp → round-half-up → 1667.
      expect(header.porcentajeBp).toBe(1667n);
      // W-2: single-shot contra el helper compartido (D-04) — nunca 1666.
      expect(header.porcentajeBp).toBe(
        porcentajeBasisPoints(250000n, 1500000n),
      );
      // Los grupos llevan subtotales y conteos correctos (wiring del servicio).
      expect(header.grupos.map((g) => g.nombre)).toEqual([
        'Comida',
        NOMBRE_SIN_CATEGORIA,
      ]);
      expect(header.grupos[0].subtotal).toBe(150000n);
      expect(header.grupos[0].conteo).toBe(3);
      expect(header.grupos[1].subtotal).toBe(100000n);
      expect(header.grupos[1].conteo).toBe(2);
    });
  });

  describe('debug logging (ADR-013/033 — redaction contract)', () => {
    it('logger.debug recibe solo conteos — nunca montos del fixture', async () => {
      const readers = makeReaders(
        [
          makeRow({ id: 'tx-1', cargo: 50000n }),
          makeRow({ id: 'tx-2', cargo: 40000n }),
        ],
        [incomeRow(1500000n)],
      );
      const logger = new FakeLogger();
      const uc = makeUseCase(readers, logger);

      await uc.execute({
        userId: 'user-a',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      // Montos del fixture (cargos + ingreso base) jamás logueados — solo conteos.
      expect(serializedContexts).not.toContain('50000');
      expect(serializedContexts).not.toContain('40000');
      expect(serializedContexts).not.toContain('1500000');
      expect(serializedContexts).not.toContain('Compra supermercado');
      expect(serializedContexts).not.toContain('12345678');
    });
  });
});
