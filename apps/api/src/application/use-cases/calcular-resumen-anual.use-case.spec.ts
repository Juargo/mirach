import { CalcularResumenAnualUseCase } from './calcular-resumen-anual.use-case';
import {
  IResumenAnualReader,
  BucketSumRowAnual,
} from '../ports/resumen-anual.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { AnioInvalidoError } from '../../domain/errors/anio-invalido.error';

// ──────────────────────────────────────────────────────────────────────────────
// T-XX: Unit tests — CalcularResumenAnualUseCase (mocked IResumenAnualReader)
// No DB, no infrastructure imports. Mirrors CalcularResumenMesUseCase pattern.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockReader(rows: BucketSumRowAnual[]): IResumenAnualReader {
  return {
    sumarPorBucketAnual: vi.fn().mockResolvedValue(rows),
  };
}

function rowsFor(mes: string): BucketSumRowAnual[] {
  return [
    { mes, bucket: Bucket.Ingreso, totalCargo: 0n, totalAbono: 1_000_000n },
    { mes, bucket: Bucket.Necesidades, totalCargo: 500_000n, totalAbono: 0n },
    { mes, bucket: Bucket.Deseos, totalCargo: 300_000n, totalAbono: 0n },
    { mes, bucket: Bucket.Ahorro, totalCargo: 200_000n, totalAbono: 0n },
    { mes, bucket: Bucket.SinCategoria, totalCargo: 0n, totalAbono: 0n },
  ];
}

describe('CalcularResumenAnualUseCase', () => {
  describe('happy path: full year with data in every month', () => {
    it('returns 12 ResumenMes in Jan→Dec order, each with correct totals', async () => {
      const allRows: BucketSumRowAnual[] = [];
      for (let m = 1; m <= 12; m++) {
        allRows.push(...rowsFor(`2026-${String(m).padStart(2, '0')}`));
      }
      const reader = makeMockReader(allRows);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      const { resumenAnual } = result.getValue();
      expect(resumenAnual.anio).toBe(2026);
      expect(resumenAnual.meses).toHaveLength(12);
      for (const mes of resumenAnual.meses) {
        expect(mes.totalIngreso).toBe(1_000_000n);
        expect(mes.sinIngreso).toBe(false);
      }
    });

    it('returns the resolved anio number', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().anio).toBe(2026);
    });
  });

  describe('month with only SOME buckets present (not all 5, not empty)', () => {
    it('missing buckets default to 0n; percentages/semáforo compute from the present rows only', async () => {
      // Only Ingreso and Necesidades rows exist for this month — Deseos,
      // Ahorro, SinCategoria are genuinely ABSENT from the reader's result
      // (not zero-valued rows). Pins the `rowMap.get(...) ?? 0n` defaulting
      // in construirResumenMesDesdeFilas.
      const rows: BucketSumRowAnual[] = [
        { mes: '2026-01', bucket: Bucket.Ingreso, totalCargo: 0n, totalAbono: 1_000_000n },
        { mes: '2026-01', bucket: Bucket.Necesidades, totalCargo: 500_000n, totalAbono: 0n },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      const [enero] = result.getValue().resumenAnual.meses;

      expect(enero.sinIngreso).toBe(false);
      expect(enero.totalIngreso).toBe(1_000_000n);

      const necesidades = enero.buckets.find(
        (b) => b.bucket === Bucket.Necesidades,
      );
      expect(necesidades?.total).toBe(500_000n);
      expect(necesidades?.porcentajeBp).toBe(5000n);

      const deseos = enero.buckets.find((b) => b.bucket === Bucket.Deseos);
      const ahorro = enero.buckets.find((b) => b.bucket === Bucket.Ahorro);
      const sinCategoria = enero.buckets.find(
        (b) => b.bucket === Bucket.SinCategoria,
      );
      expect(deseos?.total).toBe(0n);
      expect(deseos?.porcentajeBp).toBe(0n);
      expect(ahorro?.total).toBe(0n);
      expect(ahorro?.porcentajeBp).toBe(0n);
      expect(sinCategoria?.total).toBe(0n);
      expect(sinCategoria?.porcentajeBp).toBe(0n);
    });
  });

  describe('year with some empty months', () => {
    it('empty months yield a zeroed sinIngreso ResumenMes, other months keep their data', async () => {
      // Only January has data; rest of the year is empty.
      const reader = makeMockReader(rowsFor('2026-01'));
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      const { resumenAnual } = result.getValue();
      const [enero, febrero, ...resto] = resumenAnual.meses;

      expect(enero.totalIngreso).toBe(1_000_000n);
      expect(enero.sinIngreso).toBe(false);

      expect(febrero.totalIngreso).toBe(0n);
      expect(febrero.sinIngreso).toBe(true);

      for (const mes of resto) {
        expect(mes.sinIngreso).toBe(true);
        for (const slice of mes.buckets) {
          expect(slice.total).toBe(0n);
        }
      }
    });
  });

  describe('empty year (no data at all)', () => {
    it('returns 12 zeroed sinIngreso ResumenMes', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      const { resumenAnual } = result.getValue();
      expect(resumenAnual.meses).toHaveLength(12);
      for (const mes of resumenAnual.meses) {
        expect(mes.sinIngreso).toBe(true);
        expect(mes.totalIngreso).toBe(0n);
      }
    });
  });

  describe('anio validation', () => {
    it('absent anio → resolves to current UTC year', async () => {
      const now = new Date();
      const expectedAnio = now.getUTCFullYear();

      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().anio).toBe(expectedAnio);
    });

    it('invalid anio (non-numeric) → Result.fail(AnioInvalidoError)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: 'not-a-year' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('anio out of range (1999) → Result.fail(AnioInvalidoError)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '1999' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('plain "2026" → resolves to anio=2026 (canonical 4-digit format)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', anio: '2026' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().anio).toBe(2026);
    });

    it.each(['2e3', '0x7ea', ' 2026 ', '02026', '2026.0'])(
      'anio=%p → Result.fail(AnioInvalidoError) — rejected by strict ^\\d{4}$ format, not silently coerced by Number()',
      async (rawAnio) => {
        const reader = makeMockReader([]);
        const uc = new CalcularResumenAnualUseCase(reader);

        const result = await uc.execute({ userId: 'user-a', anio: rawAnio });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
      },
    );
  });

  describe('userId isolation (structural — repo receives the correct userId)', () => {
    it('passes the authenticated userId through to the reader, never a fixed constant', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenAnualUseCase(reader);

      await uc.execute({ userId: 'user-a', anio: '2026' });
      await uc.execute({ userId: 'user-b', anio: '2026' });

      expect(reader.sumarPorBucketAnual).toHaveBeenNthCalledWith(
        1,
        'user-a',
        expect.objectContaining({ anio: 2026 }),
      );
      expect(reader.sumarPorBucketAnual).toHaveBeenNthCalledWith(
        2,
        'user-b',
        expect.objectContaining({ anio: 2026 }),
      );
    });
  });
});
