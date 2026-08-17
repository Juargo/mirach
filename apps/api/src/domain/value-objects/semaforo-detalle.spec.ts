import { Bucket } from './bucket';
import {
  BANDAS_SEMAFORO,
  EstadoSemaforo,
  calcularEstadoBucket,
} from './estado-semaforo';
import { ResumenMes, porcentajeBasisPoints } from './resumen-mes';
import {
  ETIQUETA_BUCKET_COPY,
  construirSemaforoDetalle,
  diagnosticar,
  montoMaximoConBpHasta,
  montoMinimoConBpDesde,
  montoParaVerde,
} from './semaforo-detalle';

const DIAGNOSTICO_SIN_INGRESO =
  'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.';
const DIAGNOSTICO_VERDE =
  'Tu mes está en verde: los tres grupos están dentro de su rango.';

/** Convenience factory — mirrors ResumenMes.crear's field order, base income 1_000_000n. */
function resumenCon(
  fields: Partial<{
    totalIngreso: bigint;
    necesidades: bigint;
    deseos: bigint;
    ahorro: bigint;
    sinCategoria: bigint;
    cantidadSinCategoria: number;
  }>,
): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: fields.totalIngreso ?? 1_000_000n,
    necesidades: fields.necesidades ?? 0n,
    deseos: fields.deseos ?? 0n,
    ahorro: fields.ahorro ?? 0n,
    sinCategoria: fields.sinCategoria ?? 0n,
    cantidadSinCategoria: fields.cantidadSinCategoria ?? 0,
  });
}

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

// ──────────────────────────────────────────────────────────────────────────────
// US-049 (PR2b): copy + assembly — Groups D/E/F/G per design.md §1.4/§1.2 and
// tasks.md Phase 3. Fixture income is 1_000_000n throughout so bp === total/100
// (e.g. 700_000n → 7000bp), matching the band edges in BANDAS_SEMAFORO.
// ──────────────────────────────────────────────────────────────────────────────

describe('diagnosticar (Group D — SEM-01, D-10)', () => {
  it('D1: estadoGlobal === null (sinIngreso) → the no-income diagnosis', () => {
    const resumen = resumenCon({ totalIngreso: 0n });
    expect(resumen.estadoGlobal).toBeNull();
    expect(diagnosticar(resumen)).toBe(DIAGNOSTICO_SIN_INGRESO);
  });

  it('D2: all three buckets Verde → the healthy-month diagnosis', () => {
    const resumen = resumenCon({
      necesidades: 500_000n, // bp 5000 — Verde
      deseos: 300_000n, // bp 3000 — Verde
      ahorro: 300_000n, // bp 3000 — Verde (within [2000,4000])
    });
    expect(resumen.estadoGlobal).toBe(EstadoSemaforo.Verde);
    expect(diagnosticar(resumen)).toBe(DIAGNOSTICO_VERDE);
  });

  it('one driving bucket (Necesidades Rojo) → names only Necesidades', () => {
    const resumen = resumenCon({
      necesidades: 700_000n, // bp 7000 — Rojo
      deseos: 200_000n, // bp 2000 — Verde
      ahorro: 250_000n, // bp 2500 — Verde
    });
    expect(diagnosticar(resumen)).toBe('Tu mes está en rojo por Necesidades.');
  });

  it('Deseos driving → uses the product label "Gustos", not "Deseos"', () => {
    const resumen = resumenCon({
      necesidades: 400_000n, // bp 4000 — Verde
      deseos: 450_000n, // bp 4500 — Rojo (Deseos rojo is bp > 4000)
      ahorro: 250_000n, // bp 2500 — Verde
    });
    expect(diagnosticar(resumen)).toBe('Tu mes está en rojo por Gustos.');
  });

  it('two-way tie (Necesidades + Deseos both Rojo) → names both, fixed order', () => {
    const resumen = resumenCon({
      necesidades: 700_000n, // Rojo
      deseos: 450_000n, // Rojo
      ahorro: 250_000n, // Verde
    });
    expect(diagnosticar(resumen)).toBe(
      'Tu mes está en rojo por Necesidades y Gustos.',
    );
  });

  it('three-way tie (all Rojo) → names all three, fixed order', () => {
    const resumen = resumenCon({
      necesidades: 700_000n, // Rojo
      deseos: 450_000n, // Rojo
      ahorro: 600_000n, // bp 6000 — Rojo (Ahorro rojo is bp > 5000)
    });
    expect(diagnosticar(resumen)).toBe(
      'Tu mes está en rojo por Necesidades, Gustos y Ahorro.',
    );
  });

  it('Rojo + Amarillo mix → names only the Rojo bucket', () => {
    const resumen = resumenCon({
      necesidades: 700_000n, // Rojo
      deseos: 350_000n, // bp 3500 — Amarillo (Deseos amarillo is 3001..4000)
      ahorro: 250_000n, // Verde
    });
    expect(diagnosticar(resumen)).toBe('Tu mes está en rojo por Necesidades.');
  });

  it('listing order is fixed (Necesidades → Deseos → Ahorro) for any tied subset, not input-dependent', () => {
    // ResumenMes.crear always assembles buckets in a fixed internal order
    // (SPEND_BUCKETS); this test demonstrates the tie-naming order is the
    // fixed product order even for a subset that SKIPS the middle bucket
    // (Necesidades + Ahorro tied, Deseos Verde) — not an artifact of
    // whichever bucket happened to be set first in this fixture.
    const resumen = resumenCon({
      necesidades: 700_000n, // Rojo
      deseos: 200_000n, // Verde
      ahorro: 600_000n, // Rojo
    });
    expect(diagnosticar(resumen)).toBe(
      'Tu mes está en rojo por Necesidades y Ahorro.',
    );
  });

  it('never contains the {monto} placeholder — money lives in per-bucket advice, not the diagnosis', () => {
    const resumen = resumenCon({ necesidades: 700_000n, ahorro: 600_000n });
    expect(diagnosticar(resumen)).not.toContain('{monto}');
  });
});

describe('ETIQUETA_BUCKET_COPY (Group E — cross-workspace copy pin)', () => {
  it('Deseos maps to "Gustos", matching apps/web/src/lib/bucket-colors.ts ETIQUETA_BUCKET', () => {
    expect(ETIQUETA_BUCKET_COPY[Bucket.Deseos]).toBe('Gustos');
  });
});

describe('mensajeConsejo via montoParaVerde (Group F — SEM-10, D-05, D-08)', () => {
  it('"excede" case: exact A1 template with the Necesidades label', () => {
    const consejo = montoParaVerde(Bucket.Necesidades, 550_000n, 1_000_000n);
    expect(consejo?.caso).toBe('excede');
    expect(consejo?.mensaje).toBe(
      'Para volver a Verde, reduce {monto} en Necesidades este mes.',
    );
  });

  it('"ahorro-bajo" case: exact A1 template with the Ahorro label and "aumenta"', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 150_000n, 1_000_000n);
    expect(consejo?.caso).toBe('ahorro-bajo');
    expect(consejo?.mensaje).toBe(
      'Para volver a Verde, aumenta {monto} en Ahorro este mes.',
    );
  });

  it('"ahorro-alto" case: exact A2 template, ceiling semantics (D-09/D-08b)', () => {
    const consejo = montoParaVerde(Bucket.Ahorro, 450_000n, 1_000_000n);
    expect(consejo?.caso).toBe('ahorro-alto');
    expect(consejo?.mensaje).toBe(
      'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.',
    );
  });

  it('every mensaje contains the {monto} placeholder exactly once', () => {
    const mensajes = [
      montoParaVerde(Bucket.Necesidades, 550_000n, 1_000_000n)?.mensaje,
      montoParaVerde(Bucket.Deseos, 450_000n, 1_000_000n)?.mensaje,
      montoParaVerde(Bucket.Ahorro, 150_000n, 1_000_000n)?.mensaje,
      montoParaVerde(Bucket.Ahorro, 450_000n, 1_000_000n)?.mensaje,
    ];
    for (const mensaje of mensajes) {
      expect(mensaje).toBeDefined();
      expect(mensaje?.split('{monto}').length).toBe(2); // exactly 1 occurrence
    }
  });
});

describe('construirSemaforoDetalle (Group G — SEM-01/02/05/06, D-01/D-03)', () => {
  it('exactly 3 buckets, fixed order Necesidades → Deseos → Ahorro', () => {
    const detalle = construirSemaforoDetalle(resumenCon({}));
    expect(detalle.buckets.map((b) => b.bucket)).toEqual([
      Bucket.Necesidades,
      Bucket.Deseos,
      Bucket.Ahorro,
    ]);
  });

  it('bandas are carried per bucket from the single BANDAS_SEMAFORO table', () => {
    const detalle = construirSemaforoDetalle(resumenCon({}));
    for (const b of detalle.buckets) {
      expect(b.bandas).toBe(
        BANDAS_SEMAFORO[b.bucket as keyof typeof BANDAS_SEMAFORO],
      );
    }
  });

  it('metaBp is 5000/3000/2000 for Necesidades/Deseos/Ahorro', () => {
    const detalle = construirSemaforoDetalle(resumenCon({}));
    expect(detalle.buckets[0].bandas.metaBp).toBe(5000n);
    expect(detalle.buckets[1].bandas.metaBp).toBe(3000n);
    expect(detalle.buckets[2].bandas.metaBp).toBe(2000n);
  });

  it('bucketsCriticos is [] when the month is all-Verde', () => {
    const detalle = construirSemaforoDetalle(
      resumenCon({ necesidades: 500_000n, deseos: 300_000n, ahorro: 300_000n }),
    );
    expect(detalle.bucketsCriticos).toEqual([]);
  });

  it('bucketsCriticos names the driving buckets, matching diagnosticar', () => {
    const resumen = resumenCon({
      necesidades: 700_000n, // Rojo
      deseos: 450_000n, // Rojo
      ahorro: 250_000n, // Verde
    });
    const detalle = construirSemaforoDetalle(resumen);
    expect(detalle.bucketsCriticos).toEqual([
      Bucket.Necesidades,
      Bucket.Deseos,
    ]);
  });

  it('sinCategoria {cantidad,total} is carried verbatim from ResumenMes, not recomputed (SEM-05)', () => {
    const detalle = construirSemaforoDetalle(
      resumenCon({ sinCategoria: 12_345n, cantidadSinCategoria: 7 }),
    );
    expect(detalle.sinCategoria).toEqual({ cantidad: 7, total: 12_345n });
  });

  it('sinIngreso → every consejo/estado null, diagnostico is D1 (SEM-06/CA-07)', () => {
    const detalle = construirSemaforoDetalle(resumenCon({ totalIngreso: 0n }));
    expect(detalle.sinIngreso).toBe(true);
    expect(detalle.diagnostico).toBe(DIAGNOSTICO_SIN_INGRESO);
    for (const b of detalle.buckets) {
      expect(b.estadoSemaforo).toBeNull();
      expect(b.consejo).toBeNull();
    }
  });
});
