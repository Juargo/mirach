import { Bucket } from './bucket';
import {
  EstadoSemaforo,
  calcularEstadoBucket,
  calcularEstadoGlobal,
} from './estado-semaforo';

// ──────────────────────────────────────────────────────────────────────────────
// T-US016-01: Unit tests — EstadoSemaforo enum + calcularEstadoBucket/Global
// Money-adjacent (ADR-015): pure bigint comparisons, no float, no Math.*
// Covers 32 BDD scenarios from US-016 spec.
// ──────────────────────────────────────────────────────────────────────────────

describe('calcularEstadoBucket — Necesidades (SC-N-01..06)', () => {
  it('SC-N-06: 0n → Verde', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 0n)).toBe(EstadoSemaforo.Verde);
  });

  it('SC-N-01: 5000n → Verde (exact lower green boundary, greener side inclusive)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 5000n)).toBe(EstadoSemaforo.Verde);
  });

  it('SC-N-02: 5001n → Amarillo (one bp above green boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 5001n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-N-03: 6000n → Amarillo (exact upper Amarillo boundary, greener side inclusive)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 6000n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-N-04: 6001n → Rojo (one bp above Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 6001n)).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-N-05: 8000n → Rojo (deep Rojo)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, 8000n)).toBe(EstadoSemaforo.Rojo);
  });
});

describe('calcularEstadoBucket — Deseos (SC-D-01..04)', () => {
  it('SC-D-01: 3000n → Verde (exact green boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Deseos, 3000n)).toBe(EstadoSemaforo.Verde);
  });

  it('SC-D-02: 3001n → Amarillo (one bp above green boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Deseos, 3001n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-D-03: 4000n → Amarillo (exact upper Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Deseos, 4000n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-D-04: 4001n → Rojo (one bp above Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Deseos, 4001n)).toBe(EstadoSemaforo.Rojo);
  });
});

describe('calcularEstadoBucket — Ahorro bidirectional (SC-A-01..10)', () => {
  it('SC-A-09: 0n → Rojo (zero savings)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 0n)).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-A-06: 999n → Rojo (one bp below lower Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 999n)).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-A-05: 1000n → Amarillo (exact lower Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 1000n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-A-02: 1999n → Amarillo (one bp below lower Verde boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 1999n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-A-01: 2000n → Verde (exact lower Verde boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 2000n)).toBe(EstadoSemaforo.Verde);
  });

  it('interior: 3000n → Verde', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 3000n)).toBe(EstadoSemaforo.Verde);
  });

  it('SC-A-03: 4000n → Verde (exact upper Verde boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 4000n)).toBe(EstadoSemaforo.Verde);
  });

  it('SC-A-04: 4001n → Amarillo (one bp above upper Verde boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 4001n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-A-07: 5000n → Amarillo (exact upper Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 5000n)).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-A-08: 5001n → Rojo (one bp above upper Amarillo boundary)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 5001n)).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-A-10: 10000n → Rojo (extreme over-saving 100%)', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, 10000n)).toBe(EstadoSemaforo.Rojo);
  });
});

describe('calcularEstadoBucket — SinCategoria always null (SC-SC-01..02)', () => {
  it('SC-SC-01: SinCategoria with non-null bp → null (no rule applies)', () => {
    expect(calcularEstadoBucket(Bucket.SinCategoria, 2000n)).toBeNull();
  });

  it('SC-SC-02: SinCategoria at 0n → null', () => {
    expect(calcularEstadoBucket(Bucket.SinCategoria, 0n)).toBeNull();
  });
});

describe('calcularEstadoBucket — null porcentajeBp propagation (SC-NULL-01..03)', () => {
  it('SC-NULL-01: null on Necesidades → null (sinIngreso path)', () => {
    expect(calcularEstadoBucket(Bucket.Necesidades, null)).toBeNull();
  });

  it('SC-NULL-02: null on Deseos → null', () => {
    expect(calcularEstadoBucket(Bucket.Deseos, null)).toBeNull();
  });

  it('SC-NULL-03: null on Ahorro → null', () => {
    expect(calcularEstadoBucket(Bucket.Ahorro, null)).toBeNull();
  });
});

describe('calcularEstadoGlobal (SC-G-01..07)', () => {
  it('SC-G-01: [Verde, Verde, Verde] → Verde', () => {
    expect(
      calcularEstadoGlobal([EstadoSemaforo.Verde, EstadoSemaforo.Verde, EstadoSemaforo.Verde]),
    ).toBe(EstadoSemaforo.Verde);
  });

  it('SC-G-02: [Verde, Amarillo, Verde] → Amarillo (worst wins)', () => {
    expect(
      calcularEstadoGlobal([EstadoSemaforo.Verde, EstadoSemaforo.Amarillo, EstadoSemaforo.Verde]),
    ).toBe(EstadoSemaforo.Amarillo);
  });

  it('SC-G-03: [Verde, Amarillo, Rojo] → Rojo', () => {
    expect(
      calcularEstadoGlobal([EstadoSemaforo.Verde, EstadoSemaforo.Amarillo, EstadoSemaforo.Rojo]),
    ).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-G-04: [Rojo, Verde, Verde] → Rojo (any Rojo → Rojo)', () => {
    expect(
      calcularEstadoGlobal([EstadoSemaforo.Rojo, EstadoSemaforo.Verde, EstadoSemaforo.Verde]),
    ).toBe(EstadoSemaforo.Rojo);
  });

  it('SC-G-05: [Verde, Verde, Verde, null] → Verde (null from SinCategoria excluded)', () => {
    expect(
      calcularEstadoGlobal([EstadoSemaforo.Verde, EstadoSemaforo.Verde, EstadoSemaforo.Verde, null]),
    ).toBe(EstadoSemaforo.Verde);
  });

  it('SC-G-06: [null, null, null] → null (all null = sinIngreso)', () => {
    expect(calcularEstadoGlobal([null, null, null])).toBeNull();
  });

  it('SC-G-07: [null, null, Verde] → Verde (nulls are skipped, not counted)', () => {
    expect(calcularEstadoGlobal([null, null, EstadoSemaforo.Verde])).toBe(EstadoSemaforo.Verde);
  });
});
