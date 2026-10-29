import { Bucket } from './bucket';

// ──────────────────────────────────────────────────────────────────────────────
// Issue #113: EstadoBloque — rule 9 (decided 2026-10-23) for each 50/30/20
// block, and the month state as the worst block (VIS-11, VIS-12).
// Money-adjacent (ADR-010): bigint comparisons only, no float / Math.* /
// Number. Coexists with EstadoSemaforo (verde/amarillo/rojo), which stays on
// the wire until the minimum app version moves past it (ADR-005 §4).
// ──────────────────────────────────────────────────────────────────────────────

/** The three block states of rule 9. "Bien" replaces the former "dentro". */
export enum EstadoBloque {
  Bien = 'Bien',
  Cerca = 'Cerca',
  Sobre = 'Sobre',
}

/** Fixed threshold for "cerca", the same for the three blocks: 5 points. */
export const UMBRAL_CERCA_BP = 500n;

/** Higher number = worse state. Used by calcularEstadoMes. */
const SEVERIDAD: Record<EstadoBloque, number> = {
  [EstadoBloque.Bien]: 0,
  [EstadoBloque.Cerca]: 1,
  [EstadoBloque.Sobre]: 2,
};

/**
 * Blocks with a target. Necesidades and Gustos (bucket Deseos) are
 * unfavorable above their target; Ahorro is unfavorable below it.
 */
const DESFAVORABLE_BAJO_LA_META: Partial<Record<Bucket, boolean>> = {
  [Bucket.Necesidades]: false,
  [Bucket.Deseos]: false,
  [Bucket.Ahorro]: true,
};

/**
 * calcularEstadoBloque — rule 9 for one block.
 *
 * - porcentajeBp null (sinIngreso) → null
 * - bucket without a target (Ingreso) → null
 * - deviation in the unfavorable direction ≤ 0 → Bien
 * - deviation ≤ UMBRAL_CERCA_BP (inclusive) → Cerca
 * - otherwise → Sobre
 *
 * `metaBp` comes from the caller so a budget profile (#110) can replace the
 * fixed 50/30/20 targets without touching this rule.
 */
export function calcularEstadoBloque(
  bucket: Bucket,
  porcentajeBp: bigint | null,
  metaBp: bigint,
): EstadoBloque | null {
  if (porcentajeBp === null) return null;
  const bajoLaMeta = DESFAVORABLE_BAJO_LA_META[bucket];
  if (bajoLaMeta === undefined) return null;
  const desvioBp = bajoLaMeta ? metaBp - porcentajeBp : porcentajeBp - metaBp;
  if (desvioBp <= 0n) return EstadoBloque.Bien;
  if (desvioBp <= UMBRAL_CERCA_BP) return EstadoBloque.Cerca;
  return EstadoBloque.Sobre;
}

/** Result of calcularEstadoMes. */
export interface EstadoMes {
  /** Worst block state; null when no block has a state (sinIngreso). */
  readonly estado: EstadoBloque | null;
  /**
   * Blocks that define the month state (every block tied at the worst state,
   * in input order), for the month sentence (VIS-03). Empty when the month is
   * Bien or has no state.
   */
  readonly bloques: ReadonlyArray<Bucket>;
}

/**
 * calcularEstadoMes — the month takes the worst state of its blocks (VIS-11).
 * There is no separate criterion for "Desconocido": those movements already
 * count in Gustos (VIS-12, rule 14).
 */
export function calcularEstadoMes(
  bloques: ReadonlyArray<{
    readonly bucket: Bucket;
    readonly estado: EstadoBloque | null;
  }>,
): EstadoMes {
  let peor: EstadoBloque | null = null;
  for (const { estado } of bloques) {
    if (estado === null) continue;
    if (peor === null || SEVERIDAD[estado] > SEVERIDAD[peor]) peor = estado;
  }
  if (peor === null || peor === EstadoBloque.Bien) {
    return { estado: peor, bloques: [] };
  }
  return {
    estado: peor,
    bloques: bloques.filter((b) => b.estado === peor).map((b) => b.bucket),
  };
}
