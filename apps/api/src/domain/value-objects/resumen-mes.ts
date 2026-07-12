import { Bucket } from './bucket';
import {
  EstadoSemaforo,
  calcularEstadoBucket,
  calcularEstadoGlobal,
} from './estado-semaforo';

// ──────────────────────────────────────────────────────────────────────────────
// T-01: ResumenMes VO + porcentajeBasisPoints helper + TARGETS_503020
// Money-critical (ADR-015, DR-02): pure BigInt math, no float, no Math.*, no
// parseFloat anywhere in this file.
// US-016 enrichment: estadoSemaforo per bucket + estadoGlobal on ResumenMes.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * porcentajeBasisPoints — pure round-half-up helper.
 *
 * Returns the percentage of `total` relative to `base` in basis points
 * (10000 = 100.00%), using integer round-half-up arithmetic.
 *
 * Formula: (total * 10000n + base / 2n) / base
 * BigInt division truncates toward zero; the `+ base/2n` term shifts a
 * true .5 remainder up so it rounds to the next integer instead of down.
 *
 * Returns null when base === 0n (sinIngreso path — no division by zero).
 * Never uses JavaScript number, Math.*, or parseFloat.
 */
export function porcentajeBasisPoints(
  total: bigint,
  base: bigint,
): bigint | null {
  if (base === 0n) return null;
  return (total * 10000n + base / 2n) / base;
}

/**
 * TARGETS_503020 — hardcoded reference targets for the 50/30/20 rule.
 *
 * These are documentation-only reference constants for US-016/UI.
 * The split logic enumerates spend buckets; it does NOT read these targets.
 * Values are plain numbers (percentage points, not basis points) for UI display.
 */
export const TARGETS_503020: Partial<Record<Bucket, number>> = {
  [Bucket.Necesidades]: 50,
  [Bucket.Deseos]: 30,
  [Bucket.Ahorro]: 20,
} as const;

/** Spend buckets that appear as slices in ResumenMes (Ingreso is the base). */
const SPEND_BUCKETS = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
  Bucket.SinCategoria,
] as const;

/** Shape of each spend-bucket slice in the resumen. */
export interface BucketSlice {
  readonly bucket: Bucket;
  readonly total: bigint;
  readonly porcentajeBp: bigint | null;
  /** Traffic-light health estado for this bucket (US-016). null for SinCategoria or sinIngreso. */
  readonly estadoSemaforo: EstadoSemaforo | null;
}

/** Input shape for ResumenMes.crear(). */
export interface ResumenMesInput {
  readonly totalIngreso: bigint;
  readonly necesidades: bigint;
  readonly deseos: bigint;
  readonly ahorro: bigint;
  readonly sinCategoria: bigint;
}

/**
 * ResumenMes — domain value object for the 50/30/20 monthly breakdown (US-015).
 *
 * Immutable; construction via static `crear()` which never fails (base=0n is
 * a valid sinIngreso state, not an error). Holds:
 *   - totalIngreso: sum of Ingreso-bucket abono for the month.
 *   - sinIngreso: true when totalIngreso === 0n.
 *   - buckets: exactly 4 spend slices (Necesidades, Deseos, Ahorro, SinCategoria).
 *     Ingreso is the denominator; it is NOT a slice.
 *
 * All monetary values stay bigint through this VO; conversion to string happens
 * only at the DTO boundary.
 */
export class ResumenMes {
  readonly totalIngreso: bigint;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketSlice>;
  /** Worst traffic-light estado across Necesidades/Deseos/Ahorro (US-016). null when sinIngreso. */
  readonly estadoGlobal: EstadoSemaforo | null;

  private constructor(
    totalIngreso: bigint,
    buckets: ReadonlyArray<BucketSlice>,
    estadoGlobal: EstadoSemaforo | null,
  ) {
    this.totalIngreso = totalIngreso;
    this.sinIngreso = totalIngreso === 0n;
    this.buckets = buckets;
    this.estadoGlobal = estadoGlobal;
  }

  /**
   * Factory method — always returns a ResumenMes (construction cannot fail).
   * When totalIngreso === 0n, all porcentajeBp will be null.
   */
  static crear(input: ResumenMesInput): ResumenMes {
    const totals: Record<(typeof SPEND_BUCKETS)[number], bigint> = {
      [Bucket.Necesidades]: input.necesidades,
      [Bucket.Deseos]: input.deseos,
      [Bucket.Ahorro]: input.ahorro,
      [Bucket.SinCategoria]: input.sinCategoria,
    };

    const buckets: BucketSlice[] = SPEND_BUCKETS.map((bucket) => {
      const total = totals[bucket];
      const porcentajeBp = porcentajeBasisPoints(total, input.totalIngreso);
      return {
        bucket,
        total,
        porcentajeBp,
        estadoSemaforo: calcularEstadoBucket(bucket, porcentajeBp),
      };
    });

    const estadoGlobal = calcularEstadoGlobal(buckets.map((b) => b.estadoSemaforo));

    return new ResumenMes(input.totalIngreso, buckets, estadoGlobal);
  }
}
