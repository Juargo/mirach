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
 * BandasBucket — the zone-band edges (and 50/30/20 target center) for a
 * single spend bucket, in basis points.
 *
 * null on `verdeMin`/`amarilloMin` means "no lower bound" — the unilateral
 * "≤ target is best" buckets (Necesidades, Deseos). Ahorro is bidirectional
 * and uses all 4 edges.
 */
export interface BandasBucket {
  /** null ⇒ no lower bound (unilateral "≤ target is best" buckets). */
  readonly verdeMin: bigint | null;
  readonly verdeMax: bigint;
  /** null ⇒ no lower amarillo band (unilateral buckets). */
  readonly amarilloMin: bigint | null;
  readonly amarilloMax: bigint;
  /** 50/30/20 target CENTER in basis points. */
  readonly metaBp: bigint;
}

/**
 * BANDAS_SEMAFORO — the SINGLE source of truth for zone-band edges and
 * 50/30/20 targets, per spend bucket. `calcularEstadoBucket` below reads
 * this table directly (US-049 design §1.1) — there is no second,
 * independently-derived copy of these 8 threshold constants anywhere.
 */
export const BANDAS_SEMAFORO = Object.freeze({
  [Bucket.Necesidades]: {
    verdeMin: null,
    verdeMax: 5000n,
    amarilloMin: null,
    amarilloMax: 6000n,
    metaBp: 5000n,
  },
  [Bucket.Deseos]: {
    verdeMin: null,
    verdeMax: 3000n,
    amarilloMin: null,
    amarilloMax: 4000n,
    metaBp: 3000n,
  },
  [Bucket.Ahorro]: {
    verdeMin: 2000n,
    verdeMax: 4000n,
    amarilloMin: 1000n,
    amarilloMax: 5000n,
    metaBp: 2000n,
  },
} as const satisfies Record<
  Bucket.Necesidades | Bucket.Deseos | Bucket.Ahorro,
  BandasBucket
>);

/**
 * estadoDesdeBandas — table-driven traffic-light classification.
 *
 * Reads a single `BandasBucket` and applies the SAME greener-side-inclusive
 * rule for both the unilateral case (`verdeMin`/`amarilloMin` null) and the
 * bidirectional Ahorro case (all 4 edges set) — replacing the former
 * `estadoUnilateral`/`estadoAhorro` pair (US-049 design §1.1, equivalence
 * table verified case by case against the 33 pre-existing tests).
 */
function estadoDesdeBandas(bp: bigint, b: BandasBucket): EstadoSemaforo {
  const enVerde = (b.verdeMin === null || bp >= b.verdeMin) && bp <= b.verdeMax;
  if (enVerde) return EstadoSemaforo.Verde;
  const enAmarillo =
    (b.amarilloMin === null || bp >= b.amarilloMin) && bp <= b.amarilloMax;
  if (enAmarillo) return EstadoSemaforo.Amarillo;
  return EstadoSemaforo.Rojo;
}

/**
 * calcularEstadoBucket — returns the traffic-light estado for a single bucket.
 *
 * Rules:
 * - porcentajeBp === null (sinIngreso)   → null (no income, no meaningful state)
 * - bucket not in BANDAS_SEMAFORO        → null (SinCategoria, Ingreso, etc. — no rule defined)
 * - bucket in BANDAS_SEMAFORO            → estadoDesdeBandas(bp, BANDAS_SEMAFORO[bucket])
 */
export function calcularEstadoBucket(
  bucket: Bucket,
  porcentajeBp: bigint | null,
): EstadoSemaforo | null {
  if (porcentajeBp === null) return null;
  const bandas = BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO];
  return bandas === undefined ? null : estadoDesdeBandas(porcentajeBp, bandas);
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
