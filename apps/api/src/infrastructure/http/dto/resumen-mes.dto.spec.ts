import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { Bucket } from '../../../domain/value-objects/bucket';
import { aResumenMesDto } from './resumen-mes.dto';

// ──────────────────────────────────────────────────────────────────────────────
// T-09: Unit tests — ResumenMesDto BigInt safety + shape
// SC-06: BigInt > Number.MAX_SAFE_INTEGER must serialize without precision loss.
// Wire format: porcentajeBp is number|null (not string), totalIngreso is string.
// ──────────────────────────────────────────────────────────────────────────────

function makeResumen(opts: {
  totalIngreso: bigint;
  necesidades?: bigint;
  deseos?: bigint;
  ahorro?: bigint;
  sinCategoria?: bigint;
}): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: opts.totalIngreso,
    necesidades: opts.necesidades ?? 0n,
    deseos: opts.deseos ?? 0n,
    ahorro: opts.ahorro ?? 0n,
    sinCategoria: opts.sinCategoria ?? 0n,
  });
}

describe('aResumenMesDto', () => {
  describe('SC-06: BigInt > Number.MAX_SAFE_INTEGER serializes exactly', () => {
    it('totalIngreso as exact decimal string when > Number.MAX_SAFE_INTEGER', () => {
      const big = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 1
      const resumen = makeResumen({ totalIngreso: big, necesidades: big });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.totalIngreso).toBe('9007199254740993');
      expect(typeof dto.totalIngreso).toBe('string');
    });

    it('bucket total as exact decimal string when > Number.MAX_SAFE_INTEGER', () => {
      const big = 9_007_199_254_740_993n;
      const resumen = makeResumen({ totalIngreso: big, necesidades: big });
      const dto = aResumenMesDto('2026-07', resumen);

      const nec = dto.buckets.find((b) => b.bucket === Bucket.Necesidades);
      expect(nec?.total).toBe('9007199254740993');
    });

    it('porcentajeBp is 10000 (number) when total === base for large BigInt', () => {
      const big = 9_007_199_254_740_993n;
      const resumen = makeResumen({ totalIngreso: big, necesidades: big });
      const dto = aResumenMesDto('2026-07', resumen);

      const nec = dto.buckets.find((b) => b.bucket === Bucket.Necesidades);
      expect(nec?.porcentajeBp).toBe(10000);
      expect(typeof nec?.porcentajeBp).toBe('number');
    });
  });

  describe('porcentajeBp wire format: number|null (user-locked decision)', () => {
    it('porcentajeBp is a JS number (not string, not bigint) when income > 0', () => {
      const resumen = makeResumen({
        totalIngreso: 1_500_000n,
        necesidades: 750_000n,
      });
      const dto = aResumenMesDto('2026-07', resumen);

      const nec = dto.buckets.find((b) => b.bucket === Bucket.Necesidades);
      expect(typeof nec?.porcentajeBp).toBe('number');
      expect(nec?.porcentajeBp).toBe(5000);
    });

    it('porcentajeBp is null when sinIngreso=true (all buckets)', () => {
      const resumen = makeResumen({ totalIngreso: 0n, necesidades: 100_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      for (const bucket of dto.buckets) {
        expect(bucket.porcentajeBp).toBeNull();
      }
    });
  });

  describe('sinIngreso shape', () => {
    it('sinIngreso=true in DTO when income=0, HTTP 200 (not an error)', () => {
      const resumen = makeResumen({ totalIngreso: 0n, necesidades: 50_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.sinIngreso).toBe(true);
      expect(dto.totalIngreso).toBe('0');
    });

    it('totalIngreso string is present even when sinIngreso=true', () => {
      const resumen = makeResumen({ totalIngreso: 0n });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.totalIngreso).toBe('0');
    });
  });

  describe('DTO shape invariants', () => {
    it('buckets always has exactly 4 entries', () => {
      const resumen = makeResumen({ totalIngreso: 1_000_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.buckets).toHaveLength(4);
    });

    it('targets shape is { Necesidades: 50, Deseos: 30, Ahorro: 20 }', () => {
      const resumen = makeResumen({ totalIngreso: 1_000_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.targets).toEqual({ Necesidades: 50, Deseos: 30, Ahorro: 20 });
    });

    it('periodo field matches the input string', () => {
      const resumen = makeResumen({ totalIngreso: 1_000_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      expect(dto.periodo).toBe('2026-07');
    });

    it('bucket names in DTO match Bucket enum values', () => {
      const resumen = makeResumen({ totalIngreso: 1_000_000n });
      const dto = aResumenMesDto('2026-07', resumen);

      const bucketNames = dto.buckets.map((b) => b.bucket);
      expect(bucketNames).toContain(Bucket.Necesidades);
      expect(bucketNames).toContain(Bucket.Deseos);
      expect(bucketNames).toContain(Bucket.Ahorro);
      expect(bucketNames).toContain(Bucket.SinCategoria);
      expect(bucketNames).not.toContain(Bucket.Ingreso);
    });

    it('total for each bucket is a string (not number or bigint)', () => {
      const resumen = makeResumen({
        totalIngreso: 1_000_000n,
        necesidades: 500_000n,
        deseos: 100_000n,
      });
      const dto = aResumenMesDto('2026-07', resumen);

      for (const bucket of dto.buckets) {
        expect(typeof bucket.total).toBe('string');
      }
    });
  });
});
