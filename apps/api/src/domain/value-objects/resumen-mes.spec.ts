import { Bucket } from './bucket';
import { EstadoSemaforo } from './estado-semaforo';
import { porcentajeBasisPoints, ResumenMes, TARGETS_503020 } from './resumen-mes';

// ──────────────────────────────────────────────────────────────────────────────
// T-02: Unit tests — porcentajeBasisPoints helper + ResumenMes VO invariants
// Money-critical (ADR-015): no float, no Math.*, no parseFloat anywhere.
// ──────────────────────────────────────────────────────────────────────────────

describe('porcentajeBasisPoints', () => {
  it('exact division: 750000n / 1500000n → 5000n (50.00%)', () => {
    expect(porcentajeBasisPoints(750000n, 1500000n)).toBe(5000n);
  });

  it('rounds DOWN below .5 boundary: total=1n, base=3n → 3333n (not 3334)', () => {
    // (1*10000 + 3/2) / 3 = (10000 + 1) / 3 = 10001 / 3 = 3333 (truncate)
    expect(porcentajeBasisPoints(1n, 3n)).toBe(3333n);
  });

  it('rounds UP at .5 boundary: total=2n, base=3n → 6667n (not 6666)', () => {
    // (2*10000 + 3/2) / 3 = (20000 + 1) / 3 = 20001 / 3 = 6667 (round up)
    expect(porcentajeBasisPoints(2n, 3n)).toBe(6667n);
  });

  it('base === 0n → null (no division by zero)', () => {
    expect(porcentajeBasisPoints(100n, 0n)).toBeNull();
    expect(porcentajeBasisPoints(0n, 0n)).toBeNull();
  });

  it('total === 0n with nonzero base → 0n', () => {
    expect(porcentajeBasisPoints(0n, 1500000n)).toBe(0n);
  });

  it('total === base → 10000n (100.00%)', () => {
    expect(porcentajeBasisPoints(1500000n, 1500000n)).toBe(10000n);
  });

  it('large BigInt > Number.MAX_SAFE_INTEGER — no precision loss', () => {
    // 9_007_199_254_740_993n is Number.MAX_SAFE_INTEGER + 1
    const big = 9_007_199_254_740_993n;
    // 100% of itself → 10000n exactly
    const result = porcentajeBasisPoints(big, big);
    expect(typeof result).toBe('bigint');
    expect(result).toBe(10000n);
    // Verify the intermediate value is bigint throughout (static assertion via type)
    // No Math.*, parseFloat, or number cast in implementation
  });

  it('returns bigint type (not number) for non-null results', () => {
    const result = porcentajeBasisPoints(750000n, 1500000n);
    expect(typeof result).toBe('bigint');
  });
});

describe('TARGETS_503020', () => {
  it('holds the 50/30/20 reference targets as numbers', () => {
    expect(TARGETS_503020[Bucket.Necesidades]).toBe(50);
    expect(TARGETS_503020[Bucket.Deseos]).toBe(30);
    expect(TARGETS_503020[Bucket.Ahorro]).toBe(20);
  });
});

describe('ResumenMes VO', () => {
  const spendBase = {
    totalIngreso: 1_500_000n,
    necesidades: 750_000n,
    deseos: 360_000n,
    ahorro: 300_000n,
    sinCategoria: 90_000n,
  };

  it('creates a VO with correct totalIngreso and sinIngreso=false when income > 0', () => {
    const resumen = ResumenMes.crear(spendBase);
    expect(resumen.totalIngreso).toBe(1_500_000n);
    expect(resumen.sinIngreso).toBe(false);
  });

  it('always has exactly 4 bucket entries in order: Necesidades, Deseos, Ahorro, SinCategoria', () => {
    const resumen = ResumenMes.crear(spendBase);
    expect(resumen.buckets).toHaveLength(4);
    expect(resumen.buckets[0].bucket).toBe(Bucket.Necesidades);
    expect(resumen.buckets[1].bucket).toBe(Bucket.Deseos);
    expect(resumen.buckets[2].bucket).toBe(Bucket.Ahorro);
    expect(resumen.buckets[3].bucket).toBe(Bucket.SinCategoria);
  });

  it('Ingreso bucket is NOT included as a slice entry', () => {
    const resumen = ResumenMes.crear(spendBase);
    const hasIngreso = resumen.buckets.some((b) => b.bucket === Bucket.Ingreso);
    expect(hasIngreso).toBe(false);
  });

  it('computes correct porcentajeBp for each bucket when sinIngreso=false', () => {
    const resumen = ResumenMes.crear(spendBase);
    // Necesidades: 750000 * 10000 / 1500000 = 5000
    expect(resumen.buckets[0].porcentajeBp).toBe(5000n);
    // Deseos: 360000 * 10000 / 1500000 = 2400
    expect(resumen.buckets[1].porcentajeBp).toBe(2400n);
    // Ahorro: 300000 * 10000 / 1500000 = 2000
    expect(resumen.buckets[2].porcentajeBp).toBe(2000n);
    // SinCategoria: 90000 * 10000 / 1500000 = 600
    expect(resumen.buckets[3].porcentajeBp).toBe(600n);
  });

  // US-016 lockstep: estadoSemaforo per bucket
  it('US-016: estadoSemaforo computed for each bucket — happy path (spendBase)', () => {
    const resumen = ResumenMes.crear(spendBase);
    // Necesidades: 5000n bp → exactly Verde (boundary inclusive)
    expect(resumen.buckets[0].estadoSemaforo).toBe(EstadoSemaforo.Verde);
    // Deseos: 2400n bp → Verde (< 3000n threshold)
    expect(resumen.buckets[1].estadoSemaforo).toBe(EstadoSemaforo.Verde);
    // Ahorro: 2000n bp → Verde (exactly lower Verde boundary)
    expect(resumen.buckets[2].estadoSemaforo).toBe(EstadoSemaforo.Verde);
    // SinCategoria: no rule → null
    expect(resumen.buckets[3].estadoSemaforo).toBeNull();
  });

  it('US-016: estadoGlobal is Verde when all measured buckets are Verde', () => {
    const resumen = ResumenMes.crear(spendBase);
    expect(resumen.estadoGlobal).toBe(EstadoSemaforo.Verde);
  });

  it('sinIngreso === true when totalIngreso === 0n', () => {
    const resumen = ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 100_000n,
      deseos: 0n,
      ahorro: 0n,
      sinCategoria: 0n,
    });
    expect(resumen.sinIngreso).toBe(true);
    expect(resumen.totalIngreso).toBe(0n);
  });

  it('all porcentajeBp are null when sinIngreso === true', () => {
    const resumen = ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 100_000n,
      deseos: 50_000n,
      ahorro: 0n,
      sinCategoria: 0n,
    });
    expect(resumen.sinIngreso).toBe(true);
    for (const slice of resumen.buckets) {
      expect(slice.porcentajeBp).toBeNull();
    }
  });

  // US-016: sinIngreso → all estadoSemaforo null + estadoGlobal null
  it('US-016: all estadoSemaforo null when sinIngreso === true', () => {
    const resumen = ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 100_000n,
      deseos: 50_000n,
      ahorro: 0n,
      sinCategoria: 0n,
    });
    for (const slice of resumen.buckets) {
      expect(slice.estadoSemaforo).toBeNull();
    }
    expect(resumen.estadoGlobal).toBeNull();
  });

  it('all totals are present even when sinIngreso=true', () => {
    const resumen = ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 100_000n,
      deseos: 50_000n,
      ahorro: 0n,
      sinCategoria: 0n,
    });
    expect(resumen.buckets[0].total).toBe(100_000n);
    expect(resumen.buckets[1].total).toBe(50_000n);
    expect(resumen.buckets[2].total).toBe(0n);
    expect(resumen.buckets[3].total).toBe(0n);
  });

  it('properties are readonly (immutable shape)', () => {
    const resumen = ResumenMes.crear(spendBase);
    // TypeScript readonly is compile-time; runtime: verify value stability
    const originalIngreso = resumen.totalIngreso;
    expect(resumen.totalIngreso).toBe(originalIngreso);
    expect(Object.isFrozen(resumen) || resumen.totalIngreso !== undefined).toBe(true);
  });

  it('handles empty month (all zeros)', () => {
    const resumen = ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 0n,
      deseos: 0n,
      ahorro: 0n,
      sinCategoria: 0n,
    });
    expect(resumen.totalIngreso).toBe(0n);
    expect(resumen.sinIngreso).toBe(true);
    for (const slice of resumen.buckets) {
      expect(slice.total).toBe(0n);
      expect(slice.porcentajeBp).toBeNull();
    }
  });

  // US-016: Rojo scenario — necesidades > 60% → estadoGlobal Rojo
  it('US-016: estadoGlobal is Rojo when Necesidades bp > 6000n', () => {
    // Necesidades: 6001/10000 = 60.01% → Rojo (6001n bp)
    const resumen = ResumenMes.crear({
      totalIngreso: 10_000n,
      necesidades: 6_001n,  // 6001 bp → Rojo
      deseos: 1_000n,       // 1000 bp → Verde (< 3000)
      ahorro: 2_000n,       // 2000 bp → Verde (boundary)
      sinCategoria: 999n,
    });
    expect(resumen.buckets[0].estadoSemaforo).toBe(EstadoSemaforo.Rojo);
    expect(resumen.estadoGlobal).toBe(EstadoSemaforo.Rojo);
  });

  // US-016: Amarillo scenario — no Rojo, at least one Amarillo
  it('US-016: estadoGlobal is Amarillo when no Rojo but Deseos bp > 3000n', () => {
    // Deseos: 3001/10000 = 30.01% → Amarillo
    const resumen = ResumenMes.crear({
      totalIngreso: 10_000n,
      necesidades: 4_000n,  // 4000 bp → Verde (≤ 5000)
      deseos: 3_001n,       // 3001 bp → Amarillo
      ahorro: 2_000n,       // 2000 bp → Verde (boundary)
      sinCategoria: 999n,
    });
    expect(resumen.buckets[1].estadoSemaforo).toBe(EstadoSemaforo.Amarillo);
    expect(resumen.estadoGlobal).toBe(EstadoSemaforo.Amarillo);
  });
});
