import { Bucket } from './bucket';
import {
  EstadoBloque,
  UMBRAL_CERCA_BP,
  calcularEstadoBloque,
  calcularEstadoMes,
} from './estado-bloque';

// ──────────────────────────────────────────────────────────────────────────────
// Issue #113 — rule 9 (decided 2026-10-23): "bien" when the block meets its
// target, "cerca" when it deviates 5 points or less, "sobre" when it deviates
// more. The threshold is fixed for the three blocks. In Ahorro, being below
// the target is the unfavorable side. Pure bigint, no float.
// ──────────────────────────────────────────────────────────────────────────────

describe('UMBRAL_CERCA_BP', () => {
  it('is 5 percentage points (500 bp)', () => {
    expect(UMBRAL_CERCA_BP).toBe(500n);
  });
});

describe('calcularEstadoBloque — Necesidades (target 5000 bp)', () => {
  it.each([
    [0n, EstadoBloque.Bien],
    [5000n, EstadoBloque.Bien],
    [5001n, EstadoBloque.Cerca],
    [5500n, EstadoBloque.Cerca],
    [5501n, EstadoBloque.Sobre],
    [5800n, EstadoBloque.Sobre],
  ])('%s bp → %s', (bp, estado) => {
    expect(calcularEstadoBloque(Bucket.Necesidades, bp, 5000n)).toBe(estado);
  });
});

describe('calcularEstadoBloque — Gustos (bucket Deseos, target 3000 bp)', () => {
  it.each([
    [3000n, EstadoBloque.Bien],
    [3001n, EstadoBloque.Cerca],
    [3500n, EstadoBloque.Cerca],
    [3501n, EstadoBloque.Sobre],
  ])('%s bp → %s', (bp, estado) => {
    expect(calcularEstadoBloque(Bucket.Deseos, bp, 3000n)).toBe(estado);
  });
});

describe('calcularEstadoBloque — Ahorro (target 2000 bp, below is unfavorable)', () => {
  it.each([
    [2000n, EstadoBloque.Bien],
    [4500n, EstadoBloque.Bien],
    [10000n, EstadoBloque.Bien],
    [1999n, EstadoBloque.Cerca],
    [1700n, EstadoBloque.Cerca],
    [1500n, EstadoBloque.Cerca],
    [1499n, EstadoBloque.Sobre],
    [0n, EstadoBloque.Sobre],
  ])('%s bp → %s', (bp, estado) => {
    expect(calcularEstadoBloque(Bucket.Ahorro, bp, 2000n)).toBe(estado);
  });
});

describe('calcularEstadoBloque — target comes from the caller', () => {
  it('uses the given target, not the 50/30/20 default', () => {
    expect(calcularEstadoBloque(Bucket.Necesidades, 5800n, 8000n)).toBe(
      EstadoBloque.Bien,
    );
    expect(calcularEstadoBloque(Bucket.Ahorro, 1700n, 1000n)).toBe(
      EstadoBloque.Bien,
    );
  });
});

describe('calcularEstadoBloque — no state', () => {
  it('returns null without income (porcentajeBp null)', () => {
    expect(calcularEstadoBloque(Bucket.Necesidades, null, 5000n)).toBeNull();
  });

  it('returns null for Ingreso, which has no target', () => {
    expect(calcularEstadoBloque(Bucket.Ingreso, 5000n, 5000n)).toBeNull();
  });
});

describe('calcularEstadoMes — worst block (VIS-11)', () => {
  it('takes the worst state and names the block that defines it', () => {
    expect(
      calcularEstadoMes([
        { bucket: Bucket.Necesidades, estado: EstadoBloque.Sobre },
        { bucket: Bucket.Deseos, estado: EstadoBloque.Cerca },
        { bucket: Bucket.Ahorro, estado: EstadoBloque.Bien },
      ]),
    ).toEqual({ estado: EstadoBloque.Sobre, bloques: [Bucket.Necesidades] });
  });

  it('cerca beats bien', () => {
    expect(
      calcularEstadoMes([
        { bucket: Bucket.Necesidades, estado: EstadoBloque.Bien },
        { bucket: Bucket.Deseos, estado: EstadoBloque.Bien },
        { bucket: Bucket.Ahorro, estado: EstadoBloque.Cerca },
      ]),
    ).toEqual({ estado: EstadoBloque.Cerca, bloques: [Bucket.Ahorro] });
  });

  it('lists every tied block, in input order', () => {
    expect(
      calcularEstadoMes([
        { bucket: Bucket.Necesidades, estado: EstadoBloque.Sobre },
        { bucket: Bucket.Deseos, estado: EstadoBloque.Cerca },
        { bucket: Bucket.Ahorro, estado: EstadoBloque.Sobre },
      ]),
    ).toEqual({
      estado: EstadoBloque.Sobre,
      bloques: [Bucket.Necesidades, Bucket.Ahorro],
    });
  });

  it('a month where every block is bien has no defining block', () => {
    expect(
      calcularEstadoMes([
        { bucket: Bucket.Necesidades, estado: EstadoBloque.Bien },
        { bucket: Bucket.Deseos, estado: EstadoBloque.Bien },
        { bucket: Bucket.Ahorro, estado: EstadoBloque.Bien },
      ]),
    ).toEqual({ estado: EstadoBloque.Bien, bloques: [] });
  });

  it('without income there is no month state', () => {
    expect(
      calcularEstadoMes([
        { bucket: Bucket.Necesidades, estado: null },
        { bucket: Bucket.Deseos, estado: null },
        { bucket: Bucket.Ahorro, estado: null },
      ]),
    ).toEqual({ estado: null, bloques: [] });
  });
});
