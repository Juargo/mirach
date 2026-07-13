import { CalcularResumenMesUseCase } from './calcular-resumen-mes.use-case';
import { IResumenMesReader, BucketSumRow } from '../ports/resumen-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';

// ──────────────────────────────────────────────────────────────────────────────
// T-05: Unit tests — CalcularResumenMesUseCase (mocked IResumenMesReader)
// No DB, no infrastructure imports. Mirrors US-014 use-case test patterns.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockReader(rows: BucketSumRow[]): IResumenMesReader {
  return {
    sumarPorBucket: vi.fn().mockResolvedValue(rows),
  };
}

function allBucketRows(
  overrides: Partial<Record<Bucket, { cargo?: bigint; abono?: bigint }>> = {},
): BucketSumRow[] {
  const defaults: Record<Bucket, { cargo: bigint; abono: bigint }> = {
    [Bucket.Ingreso]: { cargo: 0n, abono: 1_500_000n },
    [Bucket.Necesidades]: { cargo: 750_000n, abono: 0n },
    [Bucket.Deseos]: { cargo: 360_000n, abono: 0n },
    [Bucket.Ahorro]: { cargo: 300_000n, abono: 0n },
    [Bucket.SinCategoria]: { cargo: 90_000n, abono: 0n },
  };

  return (Object.keys(defaults) as Bucket[]).map((bucket) => ({
    bucket,
    totalCargo: overrides[bucket]?.cargo ?? defaults[bucket].cargo,
    totalAbono: overrides[bucket]?.abono ?? defaults[bucket].abono,
  }));
}

describe('CalcularResumenMesUseCase', () => {
  describe('happy path (SC-01): all buckets, income present', () => {
    it('returns ok with correct totalIngreso and porcentajeBp for all buckets', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(1_500_000n);
      expect(resumen.sinIngreso).toBe(false);

      const [necesidades, deseos, ahorro, sinCat] = resumen.buckets;
      expect(necesidades.porcentajeBp).toBe(5000n); // 50.00%
      expect(deseos.porcentajeBp).toBe(2400n); // 24.00%
      expect(ahorro.porcentajeBp).toBe(2000n); // 20.00%
      expect(sinCat.porcentajeBp).toBe(600n); // 6.00%
    });

    it('returns the resolved periodo string', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-07');
    });
  });

  describe('null-fold in use case (SC-03): SinCategoria already folded by repo', () => {
    it('maps SinCategoria row correctly — folding is the repo responsibility', async () => {
      // The use case receives already-folded rows from the reader (port contract).
      // Fold correctness is tested at the repository layer.
      const rows: BucketSumRow[] = [
        { bucket: Bucket.Ingreso, totalCargo: 0n, totalAbono: 1_000_000n },
        { bucket: Bucket.SinCategoria, totalCargo: 200_000n, totalAbono: 0n },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      const sinCat = resumen.buckets.find(
        (b) => b.bucket === Bucket.SinCategoria,
      );
      expect(sinCat?.total).toBe(200_000n);
      expect(sinCat?.porcentajeBp).toBe(2000n); // 200000/1000000 = 20.00%
    });
  });

  describe('sinIngreso path (SC-04): no income', () => {
    it('returns ok with sinIngreso=true and all porcentajeBp=null when no Ingreso row', async () => {
      const rows: BucketSumRow[] = [
        { bucket: Bucket.Necesidades, totalCargo: 100_000n, totalAbono: 0n },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.sinIngreso).toBe(true);
      expect(resumen.totalIngreso).toBe(0n);
      for (const slice of resumen.buckets) {
        expect(slice.porcentajeBp).toBeNull();
      }
    });

    it('is NOT a Result.fail — sinIngreso is a valid data state, not an error (SC-04)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isFail()).toBe(false);
    });
  });

  describe('empty month (SC-05)', () => {
    it('returns ok with all zeros and sinIngreso=true when reader returns empty array', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(0n);
      expect(resumen.sinIngreso).toBe(true);
      for (const slice of resumen.buckets) {
        expect(slice.total).toBe(0n);
        expect(slice.porcentajeBp).toBeNull();
      }
    });
  });

  describe('periodo validation', () => {
    it('absent periodo → resolves to current UTC month (SC-07)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe(expectedPeriodo);
    });

    it('invalid periodo → Result.fail(PeriodoInvalidoError) (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({
        userId: 'user-a',
        periodo: 'not-a-date',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('periodo with invalid month (13) → Result.fail (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-13' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('periodo with month 00 → Result.fail (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-00' });

      expect(result.isFail()).toBe(true);
    });
  });

  describe('income source correctness', () => {
    it('base is computed from Ingreso totalAbono, NOT totalCargo', async () => {
      // Ingreso row has cargo=999n (should be ignored for base) and abono=1_000_000n
      const rows: BucketSumRow[] = [
        { bucket: Bucket.Ingreso, totalCargo: 999n, totalAbono: 1_000_000n },
        { bucket: Bucket.Necesidades, totalCargo: 500_000n, totalAbono: 0n },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(reader);

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(1_000_000n); // from abono, not cargo
      const necesidades = resumen.buckets.find(
        (b) => b.bucket === Bucket.Necesidades,
      );
      expect(necesidades?.porcentajeBp).toBe(5000n); // 500000/1000000 = 5000bp
    });
  });
});
