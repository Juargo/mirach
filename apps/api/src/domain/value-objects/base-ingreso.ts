// ──────────────────────────────────────────────────────────────────────────────
// Issue #111, rule 1 (VIS-10): the base of the 50/30/20 percentages is the
// declared monthly income; without it, the sum of credits classified as
// income. Money-critical: pure bigint, no float.
// ──────────────────────────────────────────────────────────────────────────────

/** Where the percentage base comes from: declared in the profile or detected. */
export type FuenteIngreso = 'declarado' | 'detectado';

/** The income the percentages are measured against, and its source. */
export interface BaseIngreso {
  /** The base: the declared income, or the detected sum without one. */
  readonly monto: bigint;
  readonly fuente: FuenteIngreso;
  /** Sum of the period's income credits, whatever the source of the base. */
  readonly detectado: bigint;
}

/**
 * elegirBaseIngreso — picks the percentage base (rule 1). A declared income
 * wins; `null` means the user did not declare one. A base of 0 is the
 * sinIngreso case; a declared income is always positive (MesFinanciero).
 */
export function elegirBaseIngreso(
  ingresoDeclarado: bigint | null,
  ingresoDetectado: bigint,
): BaseIngreso {
  if (ingresoDeclarado !== null) {
    return {
      monto: ingresoDeclarado,
      fuente: 'declarado',
      detectado: ingresoDetectado,
    };
  }
  return {
    monto: ingresoDetectado,
    fuente: 'detectado',
    detectado: ingresoDetectado,
  };
}
