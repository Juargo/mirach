import { Bucket } from './bucket';
import {
  BANDAS_SEMAFORO,
  EstadoSemaforo,
  calcularEstadoBucket,
} from './estado-semaforo';
import { porcentajeBasisPoints } from './resumen-mes';

// ──────────────────────────────────────────────────────────────────────────────
// US-049 (PR2a): CLP-to-Verde arithmetic. Pure, BigInt-only, no I/O, never
// throws. `estado-semaforo.ts` owns CLASSIFICATION; this module owns
// EXPLANATION (how far off, in which direction, and how much CLP would
// return a bucket to Verde). See design.md §1.2/§1.3 for the derivation.
//
// SCOPE NOTE (PR2a only): this batch implements the arithmetic core
// (`montoMaximoConBpHasta`, `montoMinimoConBpDesde`, `montoParaVerde`) per
// tasks.md Phase 2. `construirSemaforoDetalle`, `diagnosticar`, and the real
// `mensajeConsejo` copy land in PR2b (Phase 3) — `mensajeConsejo` here is a
// stub returning `''` so this module compiles without pulling in copy.
// ──────────────────────────────────────────────────────────────────────────────

export type DireccionConsejo = 'reducir' | 'aumentar';
export type CasoConsejo = 'excede' | 'ahorro-bajo' | 'ahorro-alto';

export interface ConsejoVerde {
  readonly direccion: DireccionConsejo;
  readonly monto: bigint; // always > 0n
  readonly caso: CasoConsejo;
  readonly mensaje: string; // Spanish, contains the literal placeholder `{monto}` exactly once (Phase 3)
}

/**
 * montoMaximoConBpHasta — largest amount whose recomputed bp (against `base`)
 * is ≤ `bpMax`. Exact inverse of `porcentajeBasisPoints`, derived in
 * design.md §1.3: `floor(q) ≤ V ⟺ t ≤ floor((base·(V+1) − 1 − h) / 10000)`.
 *
 * NOTE (documented tension, not silently resolved): design.md §1.2 lists
 * this as a private helper ("helpers private" per T3.7's target end-state),
 * but tasks.md T2.1 (Group A, this PR) tests it BY DIRECT IMPORT — 17 cases
 * asserting the boundary and minimality properties on this function alone.
 * Exporting it is required for T2.1 to even compile. Flagged for Phase 3's
 * T3.7 to reconcile (either the export stays, or Group A/B move to testing
 * exclusively through `montoParaVerde`).
 */
export function montoMaximoConBpHasta(base: bigint, bpMax: bigint): bigint {
  return (base * (bpMax + 1n) - 1n - base / 2n) / 10000n;
}

/**
 * montoMinimoConBpDesde — smallest amount whose recomputed bp (against
 * `base`) is ≥ `bpMin`. Exact inverse of `porcentajeBasisPoints`, derived in
 * design.md §1.3: `floor(q) ≥ L ⟺ t ≥ ceil((L·base − h) / 10000)`.
 * Same export-visibility note as `montoMaximoConBpHasta` above.
 */
export function montoMinimoConBpDesde(base: bigint, bpMin: bigint): bigint {
  return (bpMin * base - base / 2n + 9999n) / 10000n;
}

/**
 * mensajeConsejo — STUB for PR2a. Real Spanish copy (A1/A2 templates, per
 * design §1.4) lands in Phase 3 (PR2b), replacing this stub. Always returns
 * `''` here so `montoParaVerde` compiles and its tests can assert on
 * `{direccion, monto, caso}` without depending on unshipped copy.
 */
function mensajeConsejo(
  _bucket: Bucket,
  _caso: CasoConsejo,
  _direccion: DireccionConsejo,
): string {
  return '';
}

/**
 * montoParaVerde — the CLP amount (and direction) that would return a
 * non-Verde bucket to Verde. Composes the two inverses above per the three
 * cases from design §1.3:
 *   (a) unilateral (Necesidades/Deseos) — always "reducir" to `verdeMax`.
 *   (b) Ahorro below the band — "aumentar" to `verdeMin`.
 *   (c) Ahorro above the band — "reducir" (liberate down) to `verdeMin`,
 *       the Verde FLOOR (ceiling semantics, D-09: max liberatable while
 *       staying ≥ 2000bp, not min-to-4000bp).
 *
 * D-11 runtime post-condition (UNCONDITIONAL, not short-circuited for case
 * (a) alone): the advice is returned ONLY if re-applying it verifiably
 * recomputes to `EstadoSemaforo.Verde`. Degrades to `null` (no advice)
 * rather than ever shipping wrong advice — fail-closed, same discipline as
 * the rest of the money code (R1 mitigation).
 */
export function montoParaVerde(
  bucket: Bucket,
  total: bigint,
  base: bigint,
): ConsejoVerde | null {
  if (base === 0n) return null; // sinIngreso — nothing to advise
  const bandas = BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO];
  if (bandas === undefined) return null; // SinCategoria / Ingreso — no rule defined

  const bp = porcentajeBasisPoints(total, base);
  const estado = calcularEstadoBucket(bucket, bp);
  if (bp === null || estado === null || estado === EstadoSemaforo.Verde) {
    return null;
  }

  let objetivo: bigint;
  let direccion: DireccionConsejo;
  let caso: CasoConsejo;

  if (bandas.verdeMin === null) {
    // (a) unilateral, always over.
    objetivo = montoMaximoConBpHasta(base, bandas.verdeMax);
    direccion = 'reducir';
    caso = 'excede';
  } else if (bp < bandas.verdeMin) {
    // (b) Ahorro below the band.
    objetivo = montoMinimoConBpDesde(base, bandas.verdeMin);
    direccion = 'aumentar';
    caso = 'ahorro-bajo';
  } else {
    // (c) Ahorro above the band.
    objetivo = montoMinimoConBpDesde(base, bandas.verdeMin);
    direccion = 'reducir';
    caso = 'ahorro-alto';
  }

  const monto = direccion === 'reducir' ? total - objetivo : objetivo - total;
  if (monto <= 0n) return null;

  // POST-CONDITION (D-11, R1): unconditional — re-apply the amount and
  // verify the recomputed bp is Verde before ever returning advice. Guards
  // the pathological small-base granularity case where one peso moves bp by
  // more than a whole band (e.g. base = 1n ⇒ 10000bp per peso).
  if (
    calcularEstadoBucket(bucket, porcentajeBasisPoints(objetivo, base)) !==
    EstadoSemaforo.Verde
  ) {
    return null;
  }

  return {
    direccion,
    monto,
    caso,
    mensaje: mensajeConsejo(bucket, caso, direccion),
  };
}
