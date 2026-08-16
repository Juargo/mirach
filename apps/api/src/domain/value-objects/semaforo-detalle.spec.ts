import { Bucket } from './bucket';
import { EstadoSemaforo, calcularEstadoBucket } from './estado-semaforo';
import { porcentajeBasisPoints } from './resumen-mes';
import {
  montoMaximoConBpHasta,
  montoMinimoConBpDesde,
  montoParaVerde,
} from './semaforo-detalle';

// ──────────────────────────────────────────────────────────────────────────────
// US-049 (PR2a): CLP-to-Verde arithmetic — Groups A/B/C per design.md §1.3 and
// tasks.md Phase 2. Money-critical (ADR-015, R1 High risk): pure BigInt math,
// no float, no Math.*, no parseFloat anywhere in this file.
//
// The 8-base fixture below is design's own choice (§1.3/§3 ledger) — spans
// pathological tiny bases (1n, 2n, 3n) through realistic incomes, exercising
// the `base / 2n` truncation asymmetry the derivation explicitly warns about.
// ──────────────────────────────────────────────────────────────────────────────

const BASES_8 = [
  1n,
  2n,
  3n,
  7n,
  10_000n,
  999_999n,
  1_000_000n,
  1_234_567n,
] as const;

describe('montoMaximoConBpHasta (Group A — R1)', () => {
  it('worked example: base=1_000_000n, bpMax=5000n → 500_049n', () => {
    expect(montoMaximoConBpHasta(1_000_000n, 5000n)).toBe(500_049n);
  });

  it.each(BASES_8)('bp(f(base)) ≤ bpMax for base=%s', (base) => {
    const f = montoMaximoConBpHasta(base, 5000n);
    const bp = porcentajeBasisPoints(f, base);
    expect(bp).not.toBeNull();
    expect(bp as bigint).toBeLessThanOrEqual(5000n);
  });

  it.each(BASES_8)('minimality: bp(f(base)+1n) > bpMax for base=%s', (base) => {
    const f = montoMaximoConBpHasta(base, 5000n);
    const bp = porcentajeBasisPoints(f + 1n, base);
    expect(bp).not.toBeNull();
    expect(bp as bigint).toBeGreaterThan(5000n);
  });
});

describe('montoMinimoConBpDesde (Group B — R1)', () => {
  it('worked example: base=1_000_000n, bpMin=2000n → 199_950n', () => {
    expect(montoMinimoConBpDesde(1_000_000n, 2000n)).toBe(199_950n);
  });

  it.each(BASES_8)('bp(f(base)) ≥ bpMin for base=%s', (base) => {
    const f = montoMinimoConBpDesde(base, 2000n);
    const bp = porcentajeBasisPoints(f, base);
    expect(bp).not.toBeNull();
    expect(bp as bigint).toBeGreaterThanOrEqual(2000n);
  });

  it.each(BASES_8)('minimality: bp(f(base)-1n) < bpMin for base=%s', (base) => {
    const f = montoMinimoConBpDesde(base, 2000n);
    const bp = porcentajeBasisPoints(f - 1n, base);
    expect(bp).not.toBeNull();
    expect(bp as bigint).toBeLessThan(2000n);
  });
});

describe('montoParaVerde (Group C — R1/R2/D-05/D-09/D-11)', () => {
  const BASE = 1_000_000n;

  it('Necesidades Verde (bp=5000) → null', () => {
    expect(montoParaVerde(Bucket.Necesidades, 500_000n, BASE)).toBeNull();
  });

  it('Necesidades Amarillo (bp=5500) → exact {reducir, monto=49_951n}', () => {
    const consejo = montoParaVerde(Bucket.Necesidades, 550_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(49_951n);
  });

  it('Necesidades Rojo (bp=6500) → exact {reducir, monto=149_951n}', () => {
    const consejo = montoParaVerde(Bucket.Necesidades, 650_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(149_951n);
  });

  it('Deseos Amarillo (bp=3500) → exact {reducir, monto=49_951n}', () => {
    const consejo = montoParaVerde(Bucket.Deseos, 350_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(49_951n);
  });

  it('Deseos Rojo (bp=4500) → exact {reducir, monto=149_951n}', () => {
    const consejo = montoParaVerde(Bucket.Deseos, 450_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(149_951n);
  });

  it('Ahorro Verde (bp=3000) → null', () => {
    expect(montoParaVerde(Bucket.Ahorro, 300_000n, BASE)).toBeNull();
  });

  it('Ahorro bp=1500 (Amarillo, below floor) → exact {aumentar, monto=49_950n}', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 150_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('aumentar');
    expect(consejo?.monto).toBe(49_950n);
  });

  it('Ahorro bp=500 (Rojo, below floor) → exact {aumentar, monto=149_950n}', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 50_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('aumentar');
    expect(consejo?.monto).toBe(149_950n);
  });

  it('Ahorro bp=4500 (Amarillo, above ceiling) → exact {reducir, monto=250_050n} — design worked example (c)', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 450_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(250_050n);
  });

  it('Ahorro bp=6000 (Rojo, above ceiling) → exact {reducir, monto=400_050n}', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 600_000n, BASE);
    expect(consejo).not.toBeNull();
    expect(consejo?.direccion).toBe('reducir');
    expect(consejo?.monto).toBe(400_050n);
  });

  it('SinCategoria → null (no rule defined)', () => {
    expect(montoParaVerde(Bucket.SinCategoria, 100n, BASE)).toBeNull();
  });

  it('Ingreso → null (no rule defined)', () => {
    expect(montoParaVerde(Bucket.Ingreso, 100n, BASE)).toBeNull();
  });

  it('base === 0n → null (sinIngreso, nothing to advise)', () => {
    expect(montoParaVerde(Bucket.Necesidades, 100n, 0n)).toBeNull();
  });

  it('D-11 guard: pathological base=1n Ahorro → null (one peso spans the whole band)', () => {
    expect(montoParaVerde(Bucket.Ahorro, 0n, 1n)).toBeNull();
  });

  describe('R1 re-apply — unilateral (Necesidades/Deseos), 8 bases × 2 buckets', () => {
    const casos = BASES_8.flatMap((base) => [
      { base, bucket: Bucket.Necesidades, bpMax: 5000n },
      { base, bucket: Bucket.Deseos, bpMax: 3000n },
    ]);

    it.each(casos)(
      'base=$base $bucket: advice always succeeds and re-applying yields Verde',
      ({ base, bucket, bpMax }) => {
        const tMax = montoMaximoConBpHasta(base, bpMax);
        const total = tMax + 1n;
        const consejo = montoParaVerde(bucket, total, base);
        expect(consejo).not.toBeNull();
        expect(consejo?.direccion).toBe('reducir');
        const nuevoTotal = total - (consejo?.monto ?? 0n);
        const bpFinal = porcentajeBasisPoints(nuevoTotal, base);
        expect(calcularEstadoBucket(bucket, bpFinal)).toBe(
          EstadoSemaforo.Verde,
        );
      },
    );
  });

  describe('R1 re-apply — Ahorro below the band, 8 bases', () => {
    // base=1n/2n: D-11 fail-closed degrade — one peso's granularity already
    // spans more than the whole 2000bp-wide Verde band, so no CLP amount can
    // be verified to land inside [2000, 4000]bp (hand-verified, not guessed:
    // bp(1n objetivo, base=1n)=10000; bp(1n objetivo, base=2n)=5000 — both
    // outside the band). The other 6 bases succeed.
    it.each(BASES_8)('base=%s', (base) => {
      const objetivo = montoMinimoConBpDesde(base, 2000n);
      const total = objetivo - 1n;
      const consejo = montoParaVerde(Bucket.Ahorro, total, base);

      if (base === 1n || base === 2n) {
        expect(consejo).toBeNull();
        return;
      }

      expect(consejo).not.toBeNull();
      expect(consejo?.direccion).toBe('aumentar');
      const nuevoTotal = total + (consejo?.monto ?? 0n);
      const bpFinal = porcentajeBasisPoints(nuevoTotal, base);
      expect(calcularEstadoBucket(Bucket.Ahorro, bpFinal)).toBe(
        EstadoSemaforo.Verde,
      );
    });
  });

  describe('R1 re-apply — Ahorro above the band, 8 bases', () => {
    // Same base=1n/2n degrade as the low-side group above (symmetric: the
    // target `objetivo` is the same verdeMin-floor amount in both cases).
    it.each(BASES_8)('base=%s', (base) => {
      const total = montoMinimoConBpDesde(base, 4001n);
      const consejo = montoParaVerde(Bucket.Ahorro, total, base);

      if (base === 1n || base === 2n) {
        expect(consejo).toBeNull();
        return;
      }

      expect(consejo).not.toBeNull();
      expect(consejo?.direccion).toBe('reducir');
      const nuevoTotal = total - (consejo?.monto ?? 0n);
      const bpFinal = porcentajeBasisPoints(nuevoTotal, base);
      expect(calcularEstadoBucket(Bucket.Ahorro, bpFinal)).toBe(
        EstadoSemaforo.Verde,
      );
    });
  });

  it('non-Verde with realistic income always gets advice — 4 bases × 3 scenarios (12 assertions, per the ledger table convention)', () => {
    const basesRealistas = [10_000n, 999_999n, 1_000_000n, 1_234_567n];
    for (const base of basesRealistas) {
      // (1) unilateral, always over.
      const tMax = montoMaximoConBpHasta(base, 5000n);
      expect(
        montoParaVerde(Bucket.Necesidades, tMax + 1n, base),
      ).not.toBeNull();

      // (2) Ahorro below the band.
      const fBajo = montoMinimoConBpDesde(base, 2000n);
      expect(montoParaVerde(Bucket.Ahorro, fBajo - 1n, base)).not.toBeNull();

      // (3) Ahorro above the band.
      const totalAlto = montoMinimoConBpDesde(base, 4001n);
      expect(montoParaVerde(Bucket.Ahorro, totalAlto, base)).not.toBeNull();
    }
  });
});
