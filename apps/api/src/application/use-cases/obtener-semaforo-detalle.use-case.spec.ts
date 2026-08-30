import { ObtenerSemaforoDetalleUseCase } from './obtener-semaforo-detalle.use-case';
import { IResumenMesReader, BucketSumRow } from '../ports/resumen-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// US-049 PR3: Unit tests — ObtenerSemaforoDetalleUseCase (mocked IResumenMesReader).
// No DB, no infrastructure imports. Mirrors CalcularResumenMesUseCase's own
// test pattern (design §1.5, tasks.md T4.1). 6 cases per design §3's ledger.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockReader(rows: BucketSumRow[]): IResumenMesReader {
  return {
    sumarPorBucket: vi.fn().mockResolvedValue(rows),
  };
}

function allBucketRows(
  overrides: Partial<
    Record<Bucket, { cargo?: bigint; abono?: bigint; cantidadCargos?: number }>
  > = {},
): BucketSumRow[] {
  const defaults: Record<
    Bucket,
    { cargo: bigint; abono: bigint; cantidadCargos: number }
  > = {
    [Bucket.Ingreso]: { cargo: 0n, abono: 1_000_000n, cantidadCargos: 0 },
    [Bucket.Necesidades]: { cargo: 650_000n, abono: 0n, cantidadCargos: 3 },
    [Bucket.Deseos]: { cargo: 240_000n, abono: 0n, cantidadCargos: 2 },
    [Bucket.Ahorro]: { cargo: 200_000n, abono: 0n, cantidadCargos: 1 },
    [Bucket.SinCategoria]: { cargo: 90_000n, abono: 0n, cantidadCargos: 7 },
  };

  return (Object.keys(defaults) as Bucket[]).map((bucket) => ({
    bucket,
    totalCargo: overrides[bucket]?.cargo ?? defaults[bucket].cargo,
    totalAbono: overrides[bucket]?.abono ?? defaults[bucket].abono,
    cantidadCargos:
      overrides[bucket]?.cantidadCargos ?? defaults[bucket].cantidadCargos,
  }));
}

describe('ObtenerSemaforoDetalleUseCase', () => {
  describe('periodo resolution', () => {
    it('absent periodo → resolves to PeriodoMes.actual() (current UTC month)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const reader = makeMockReader([]);
      const uc = new ObtenerSemaforoDetalleUseCase(reader, new NoOpLogger());

      const result = await uc.execute({ userId: 'user-a', periodo: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe(expectedPeriodo);
    });

    it('periodo válido → the reader receives the resolved PeriodoMes', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new ObtenerSemaforoDetalleUseCase(reader, new NoOpLogger());

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      expect(reader.sumarPorBucket).toHaveBeenCalledTimes(1);
      const [, periodoVO] = vi.mocked(reader.sumarPorBucket).mock.calls[0];
      expect(periodoVO.valor).toBe('2026-07');
    });

    it('periodo inválido → Result.fail(PeriodoInvalidoError), reader NOT called', async () => {
      const reader = makeMockReader([]);
      const uc = new ObtenerSemaforoDetalleUseCase(reader, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-a',
        periodo: 'not-a-date',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(reader.sumarPorBucket).not.toHaveBeenCalled();
    });
  });

  describe('sinIngreso (CA-07): a month with no income is a valid 200, not an error', () => {
    it('returns Result.ok with sinIngreso: true when the reader returns no Ingreso row', async () => {
      const reader = makeMockReader([]);
      const uc = new ObtenerSemaforoDetalleUseCase(reader, new NoOpLogger());

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isFail()).toBe(false);
      expect(result.isOk()).toBe(true);
      expect(result.getValue().detalle.sinIngreso).toBe(true);
    });
  });

  describe('userId isolation (RNF-SEC-006)', () => {
    it('userId flows verbatim to the reader', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new ObtenerSemaforoDetalleUseCase(reader, new NoOpLogger());

      await uc.execute({ userId: 'user-xyz-789', periodo: '2026-07' });

      const [userId] = vi.mocked(reader.sumarPorBucket).mock.calls[0];
      expect(userId).toBe('user-xyz-789');
    });
  });

  describe('debug logging (ADR-013/033 — redaction contract)', () => {
    it('logger.debug receives counts only, never montos and never the diagnosis sentence', async () => {
      const reader = makeMockReader(allBucketRows());
      const logger = new FakeLogger();
      const uc = new ObtenerSemaforoDetalleUseCase(reader, logger);

      await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      // Fixture montos used in allBucketRows() must never leak — only counts.
      expect(serializedContexts).not.toContain('1000000');
      expect(serializedContexts).not.toContain('650000');
      expect(serializedContexts).not.toContain('240000');
      expect(serializedContexts).not.toContain('200000');
      expect(serializedContexts).not.toContain('90000');
      // The diagnosis sentence itself must never be logged.
      expect(serializedContexts).not.toContain('Tu veredicto del mes es');
      expect(serializedContexts).not.toContain('registramos ingresos');
    });
  });
});
