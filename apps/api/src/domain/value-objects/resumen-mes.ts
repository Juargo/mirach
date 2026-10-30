import { Bucket } from './bucket';
import { participacionDelGasto } from './participacion-gasto';
import {
  EstadoSemaforo,
  calcularEstadoBucket,
  calcularEstadoGlobal,
} from './estado-semaforo';
import {
  EstadoBloque,
  calcularEstadoBloque,
  calcularEstadoMes,
} from './estado-bloque';
import { METAS_POR_DEFECTO, MetasPresupuesto } from './perfil-presupuesto';
import { FuenteIngreso, elegirBaseIngreso } from './base-ingreso';

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
] as const;

/** Shape of each spend-bucket slice in the resumen. */
export interface BucketSlice {
  readonly bucket: Bucket;
  readonly total: bigint;
  readonly porcentajeBp: bigint | null;
  /**
   * Share of this bucket in the month's total spend (the 3 spend slices), in
   * basis points; sums to exactly 10000 across slices. null when no spend.
   * Unlike porcentajeBp (share of income), this is independent of sinIngreso.
   */
  readonly participacionGastoBp: bigint | null;
  /** Budget profile goal for this block, in basis points (#110). */
  readonly metaBp: bigint;
  /** Traffic-light health estado for this bucket (US-016). null for sinIngreso. */
  readonly estadoSemaforo: EstadoSemaforo | null;
  /** Rule 9 state (issue #113): bien / cerca / sobre. null for sinIngreso. */
  readonly estado: EstadoBloque | null;
}

/** Input shape for ResumenMes.crear(). */
export interface ResumenMesInput {
  /** Detected income: sum of the period's Ingreso-bucket credits. */
  readonly totalIngreso: bigint;
  readonly necesidades: bigint;
  readonly deseos: bigint;
  readonly ahorro: bigint;
}

/**
 * ResumenMes — domain value object for the 50/30/20 monthly breakdown (US-015).
 *
 * Immutable; construction via static `crear()` which never fails (base=0n is
 * a valid sinIngreso state, not an error). Holds:
 *   - totalIngreso: the percentage base (rule 1, #111): the declared monthly
 *     income, or the sum of Ingreso-bucket abono for the month without one.
 *   - fuenteIngreso / ingresoDetectado: which base was used and the detected
 *     sum, so the response can say it (VIS-10).
 *   - sinIngreso: true when totalIngreso === 0n.
 *   - buckets: exactly 3 spend slices (Necesidades, Deseos, Ahorro).
 *     Ingreso is the denominator; it is NOT a slice.
 *
 * All monetary values stay bigint through this VO; conversion to string happens
 * only at the DTO boundary.
 */
export class ResumenMes {
  readonly totalIngreso: bigint;
  /** Source of `totalIngreso` (VIS-10): declared in the profile or detected. */
  readonly fuenteIngreso: FuenteIngreso;
  /** Sum of the month's income credits, whatever the source of the base. */
  readonly ingresoDetectado: bigint;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketSlice>;
  /** Worst traffic-light estado across Necesidades/Deseos/Ahorro (US-016). null when sinIngreso. */
  readonly estadoGlobal: EstadoSemaforo | null;
  /** Worst rule 9 state across the three blocks (VIS-11). null when sinIngreso. */
  readonly estadoMes: EstadoBloque | null;
  /** Blocks tied at the worst state (VIS-03); empty when Bien or sinIngreso. */
  readonly bloquesEstadoMes: ReadonlyArray<Bucket>;
  /** Budget profile goals the month was measured against (#110, PER-06). */
  readonly metas: MetasPresupuesto;

  private constructor(
    totalIngreso: bigint,
    fuenteIngreso: FuenteIngreso,
    ingresoDetectado: bigint,
    buckets: ReadonlyArray<BucketSlice>,
    estadoGlobal: EstadoSemaforo | null,
    metas: MetasPresupuesto,
  ) {
    this.totalIngreso = totalIngreso;
    this.fuenteIngreso = fuenteIngreso;
    this.ingresoDetectado = ingresoDetectado;
    this.metas = metas;
    this.sinIngreso = totalIngreso === 0n;
    this.buckets = buckets;
    this.estadoGlobal = estadoGlobal;
    const estadoMes = calcularEstadoMes(buckets);
    this.estadoMes = estadoMes.estado;
    this.bloquesEstadoMes = estadoMes.bloques;
  }

  /**
   * Factory method — always returns a ResumenMes (construction cannot fail).
   * When the base is 0n, all porcentajeBp will be null.
   * `metas` are the user's budget profile goals (#110); every month uses the
   * current profile (PER-06). Without them the goals are 50/30/20.
   * `ingresoDeclarado` is the profile's declared monthly income (#111); when
   * present it is the base for every month (rule 1), otherwise the detected
   * `input.totalIngreso` is.
   */
  static crear(
    input: ResumenMesInput,
    metas: MetasPresupuesto = METAS_POR_DEFECTO,
    ingresoDeclarado: bigint | null = null,
  ): ResumenMes {
    const base = elegirBaseIngreso(ingresoDeclarado, input.totalIngreso);
    const totals: Record<(typeof SPEND_BUCKETS)[number], bigint> = {
      [Bucket.Necesidades]: input.necesidades,
      [Bucket.Deseos]: input.deseos,
      [Bucket.Ahorro]: input.ahorro,
    };

    const participaciones = participacionDelGasto(
      SPEND_BUCKETS.map((bucket) => totals[bucket]),
    );

    const buckets: BucketSlice[] = SPEND_BUCKETS.map((bucket, indice) => {
      const total = totals[bucket];
      const porcentajeBp = porcentajeBasisPoints(total, base.monto);
      const metaBp = metas[bucket];
      return {
        bucket,
        total,
        porcentajeBp,
        participacionGastoBp: participaciones[indice] ?? null,
        metaBp,
        estadoSemaforo: calcularEstadoBucket(bucket, porcentajeBp, metaBp),
        estado: calcularEstadoBloque(bucket, porcentajeBp, metaBp),
      };
    });

    const estadoGlobal = calcularEstadoGlobal(
      buckets.map((b) => b.estadoSemaforo),
    );

    return new ResumenMes(
      base.monto,
      base.fuente,
      base.detectado,
      buckets,
      estadoGlobal,
      metas,
    );
  }
}
