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
  /** Budget profile goal (target CENTER) in basis points. */
  readonly metaBp: bigint;
}

/** Width of the amarillo band past the unfavorable edge (10 points). */
const ANCHO_AMARILLO_BP = 1000n;
/** Width of Ahorro's verde band above its goal (20 points). */
const ANCHO_VERDE_AHORRO_BP = 2000n;

/**
 * bandasParaMeta — zone-band edges for one spend bucket around its goal
 * (#110, decision A): the bands keep the 50/30/20 offsets and move with the
 * budget profile goal.
 *
 * - Necesidades, Deseos: verde ≤ meta, amarillo ≤ meta + 1000.
 * - Ahorro: verde meta..meta + 2000, amarillo meta − 1000..meta + 3000.
 */
export function bandasParaMeta(
  bucket: Bucket.Necesidades | Bucket.Deseos | Bucket.Ahorro,
  metaBp: bigint,
): BandasBucket {
  if (bucket === Bucket.Ahorro) {
    return {
      verdeMin: metaBp,
      verdeMax: metaBp + ANCHO_VERDE_AHORRO_BP,
      amarilloMin: metaBp - ANCHO_AMARILLO_BP,
      amarilloMax: metaBp + ANCHO_VERDE_AHORRO_BP + ANCHO_AMARILLO_BP,
      metaBp,
    };
  }
  return {
    verdeMin: null,
    verdeMax: metaBp,
    amarilloMin: null,
    amarilloMax: metaBp + ANCHO_AMARILLO_BP,
    metaBp,
  };
}

/**
 * BANDAS_SEMAFORO — the bands of the default 50/30/20 profile, per spend
 * bucket. Derived from `bandasParaMeta`, so the offsets live in one place;
 * a budget profile (#110) passes its own goal to `calcularEstadoBucket`.
 */
export const BANDAS_SEMAFORO = Object.freeze({
  [Bucket.Necesidades]: bandasParaMeta(Bucket.Necesidades, 5000n),
  [Bucket.Deseos]: bandasParaMeta(Bucket.Deseos, 3000n),
  [Bucket.Ahorro]: bandasParaMeta(Bucket.Ahorro, 2000n),
} satisfies Record<
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
 * -  * - bucket not in BANDAS_SEMAFORO        → null (Ingreso, etc. — no rule defined)
 * - bucket in BANDAS_SEMAFORO            → estadoDesdeBandas(bp, bands)
 *
 * `metaBp` is the budget profile goal (#110); without it the bands are the
 * 50/30/20 ones.
 */
export function calcularEstadoBucket(
  bucket: Bucket,
  porcentajeBp: bigint | null,
  metaBp?: bigint,
): EstadoSemaforo | null {
  if (porcentajeBp === null) return null;
  const porDefecto = BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO];
  if (porDefecto === undefined) return null;
  const bandas =
    metaBp === undefined
      ? porDefecto
      : bandasParaMeta(bucket as keyof typeof BANDAS_SEMAFORO, metaBp);
  return estadoDesdeBandas(porcentajeBp, bandas);
}

/**
 * calcularEstadoGlobal — worst-of aggregation over a list of estados.
 *
 * Iterates the provided array, skips nulls, and returns the estado with the
 * highest severity rank (Rojo > Amarillo > Verde). Returns null when every
 * estado is null (sinIngreso path or all-null list).
 *
 * Designed to receive all 3 BucketSlice estados (Necesidades/Deseos/Ahorro).
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
