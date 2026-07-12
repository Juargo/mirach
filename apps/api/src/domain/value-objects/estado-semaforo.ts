import { Bucket } from './bucket';

// ──────────────────────────────────────────────────────────────────────────────
// US-016: EstadoSemaforo — pure domain enum + traffic-light computation helpers.
// Money-adjacent (ADR-015): all threshold comparisons use bigint only.
// No I/O, no imports beyond Bucket. Zero float / Math.* / parseFloat / Number.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * EstadoSemaforo — the three traffic-light states for budget health.
 * PascalCase string values mirror the Bucket enum style.
 */
export enum EstadoSemaforo {
  Verde = 'Verde',
  Amarillo = 'Amarillo',
  Rojo = 'Rojo',
}

/**
 * SEVERIDAD — severity rank for worst-bucket aggregation.
 * Higher number = worse health. Used by calcularEstadoGlobal.
 */
const SEVERIDAD: Record<EstadoSemaforo, number> = {
  [EstadoSemaforo.Verde]: 0,
  [EstadoSemaforo.Amarillo]: 1,
  [EstadoSemaforo.Rojo]: 2,
};

/**
 * estadoUnilateral — one-sided "≤ target is best" rule for Necesidades and Deseos.
 *
 *   bp ≤ verdeMax            → Verde
 *   verdeMax < bp ≤ amarMax  → Amarillo
 *   bp > amarMax             → Rojo
 *
 * Greener boundary is INCLUSIVE (design locked decision).
 */
function estadoUnilateral(
  bp: bigint,
  verdeMax: bigint,
  amarMax: bigint,
): EstadoSemaforo {
  if (bp <= verdeMax) return EstadoSemaforo.Verde;
  if (bp <= amarMax) return EstadoSemaforo.Amarillo;
  return EstadoSemaforo.Rojo;
}

/**
 * estadoAhorro — bidirectional band rule for Ahorro (20% target = 2000bp).
 *
 * Verde zone: 2000 ≤ bp ≤ 4000  (within ±10% of target)
 * Amarillo:   1000 ≤ bp < 2000  OR  4000 < bp ≤ 5000  (within ±10% warning band)
 * Rojo:       bp < 1000  OR  bp > 5000  (critically off-target)
 *
 * All 4 band edges are INCLUSIVE on the greener side (spec SC-A-01..08).
 */
function estadoAhorro(bp: bigint): EstadoSemaforo {
  if (bp >= 2000n && bp <= 4000n) return EstadoSemaforo.Verde;
  if ((bp >= 1000n && bp < 2000n) || (bp > 4000n && bp <= 5000n))
    return EstadoSemaforo.Amarillo;
  return EstadoSemaforo.Rojo;
}

/**
 * calcularEstadoBucket — returns the traffic-light estado for a single bucket.
 *
 * Rules:
 * - porcentajeBp === null (sinIngreso)   → null (no income, no meaningful state)
 * - Bucket.SinCategoria (any bp)         → null (no rule defined in MVP)
 * - Bucket.Necesidades                   → estadoUnilateral(bp, 5000n, 6000n)
 * - Bucket.Deseos                        → estadoUnilateral(bp, 3000n, 4000n)
 * - Bucket.Ahorro                        → estadoAhorro(bp)
 * - Any other bucket (Ingreso, etc.)     → null (not a spend bucket with a rule)
 */
export function calcularEstadoBucket(
  bucket: Bucket,
  porcentajeBp: bigint | null,
): EstadoSemaforo | null {
  if (porcentajeBp === null) return null;
  switch (bucket) {
    case Bucket.Necesidades:
      return estadoUnilateral(porcentajeBp, 5000n, 6000n);
    case Bucket.Deseos:
      return estadoUnilateral(porcentajeBp, 3000n, 4000n);
    case Bucket.Ahorro:
      return estadoAhorro(porcentajeBp);
    default:
      return null;
  }
}

/**
 * calcularEstadoGlobal — worst-of aggregation over a list of estados.
 *
 * Iterates the provided array, skips nulls, and returns the estado with the
 * highest severity rank (Rojo > Amarillo > Verde). Returns null when every
 * estado is null (sinIngreso path or all-null list).
 *
 * Designed to receive all 4 BucketSlice estados (including SinCategoria).
 * SinCategoria's estado is naturally null → skipped → does not affect the result.
 */
export function calcularEstadoGlobal(
  estados: ReadonlyArray<EstadoSemaforo | null>,
): EstadoSemaforo | null {
  let peor: EstadoSemaforo | null = null;
  for (const e of estados) {
    if (e === null) continue;
    if (peor === null || SEVERIDAD[e] > SEVERIDAD[peor]) peor = e;
  }
  return peor;
}
