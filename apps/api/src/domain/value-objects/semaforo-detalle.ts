import { Bucket } from './bucket';
import {
  BANDAS_SEMAFORO,
  type BandasBucket,
  EstadoSemaforo,
  calcularEstadoBucket,
} from './estado-semaforo';
import { type ResumenMes, porcentajeBasisPoints } from './resumen-mes';

// ──────────────────────────────────────────────────────────────────────────────
// US-049: CLP-to-Verde arithmetic (PR2a) + copy and assembly (PR2b). Pure,
// BigInt-only, no I/O, never throws. `estado-semaforo.ts` owns
// CLASSIFICATION; this module owns EXPLANATION (how far off, in which
// direction, how much CLP would return a bucket to Verde, and how to say
// it). See design.md §1.2/§1.3/§1.4 for the derivations.
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
 * NOTE (T3.7 resolution — documented deviation, not silently applied):
 * design.md §1.2's public surface lists only `construirSemaforoDetalle`,
 * `montoParaVerde`, `diagnosticar`, implying this helper stays private.
 * Kept exported instead: tasks.md T2.1 (Group A, PR2a, already merged to
 * `main`) pins 17 boundary/minimality cases DIRECTLY against this function —
 * removing the export would require deleting those assertions with no
 * equivalent-precision replacement (the closest indirect route, testing
 * through `montoParaVerde`'s re-apply behavior, already exists as Group C's
 * separate R1 re-apply tests and does not re-prove strict minimality or the
 * closed-form worked examples). No other module imports this helper — the
 * export is a testability surface, not a consumer-facing API addition.
 */
export function montoMaximoConBpHasta(base: bigint, bpMax: bigint): bigint {
  return (base * (bpMax + 1n) - 1n - base / 2n) / 10000n;
}

/**
 * montoMinimoConBpDesde — smallest amount whose recomputed bp (against
 * `base`) is ≥ `bpMin`. Exact inverse of `porcentajeBasisPoints`, derived in
 * design.md §1.3: `floor(q) ≥ L ⟺ t ≥ ceil((L·base − h) / 10000)`.
 * Same T3.7 export-visibility resolution as `montoMaximoConBpHasta` above.
 */
export function montoMinimoConBpDesde(base: bigint, bpMin: bigint): bigint {
  return (bpMin * base - base / 2n + 9999n) / 10000n;
}

/**
 * ETIQUETA_BUCKET_COPY — product label per bucket, used in backend-generated
 * Spanish copy (diagnosis + advice). MUST say what the card says: the web
 * calls the Deseos bucket "Gustos" (`apps/web/src/lib/bucket-colors.ts`'s
 * `ETIQUETA_BUCKET`), so this backend prose uses the same word. Pinned by an
 * exact-value test (design §6 residual risk: no automated cross-workspace
 * gate exists — if you touch either map, touch both).
 */
export const ETIQUETA_BUCKET_COPY = Object.freeze({
  [Bucket.Necesidades]: 'Necesidades',
  [Bucket.Deseos]: 'Gustos',
  [Bucket.Ahorro]: 'Ahorro',
});

/** JSON-wire vocabulary (`ESTADO_WIRE`, `resumen-mes.dto.ts`) duplicates these
 * SAME strings deliberately — one is a wire contract, this is prose
 * vocabulary; they may diverge without either being wrong (dry.md), and the
 * domain cannot import infrastructure anyway (ADR-005). */
const PALABRA_ESTADO: Record<EstadoSemaforo, string> = {
  [EstadoSemaforo.Verde]: 'verde',
  [EstadoSemaforo.Amarillo]: 'amarillo',
  [EstadoSemaforo.Rojo]: 'rojo',
};

const VERBO: Record<DireccionConsejo, string> = {
  reducir: 'reduce',
  aumentar: 'aumenta',
};

const DIAGNOSTICO_SIN_INGRESO =
  'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.';
const DIAGNOSTICO_VERDE =
  'Tu mes está en verde: los tres grupos están dentro de su rango.';

/** Fixed product order for tie-naming (D-10) and the 3-bucket detail array (D-03). */
const BUCKETS_SEMAFORO_ORDEN = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
] as const;

/** Joins product labels: "A" · "A y B" · "A, B y C" — the D-10 tie-naming convention. */
function listarEtiquetas(etiquetas: ReadonlyArray<string>): string {
  if (etiquetas.length === 1) return etiquetas[0];
  return `${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}`;
}

/**
 * bucketsQueDrivenEstadoGlobal — the buckets sharing `resumen.estadoGlobal`'s
 * severity, in the fixed Necesidades → Deseos → Ahorro order (D-10: never
 * pick a single winner — name every tied bucket). `[]` when there is no
 * income or the month is all-Verde. Shared by `diagnosticar` and
 * `construirSemaforoDetalle`'s `bucketsCriticos` so the two can never answer
 * differently (DRY — one computation, not two).
 */
function bucketsQueDrivenEstadoGlobal(
  resumen: ResumenMes,
): ReadonlyArray<(typeof BUCKETS_SEMAFORO_ORDEN)[number]> {
  if (
    resumen.estadoGlobal === null ||
    resumen.estadoGlobal === EstadoSemaforo.Verde
  ) {
    return [];
  }
  return BUCKETS_SEMAFORO_ORDEN.filter(
    (bucket) =>
      resumen.buckets.find((slice) => slice.bucket === bucket)
        ?.estadoSemaforo === resumen.estadoGlobal,
  );
}

/**
 * diagnosticar — the single Spanish sentence naming EVERY bucket sharing the
 * worst estado (D-10), or D1/D2 for the no-income/all-Verde states. Never
 * contains `{monto}` — money lives in the per-bucket advice, not here (D-05,
 * SEM-01).
 */
export function diagnosticar(resumen: ResumenMes): string {
  if (resumen.estadoGlobal === null) return DIAGNOSTICO_SIN_INGRESO;
  if (resumen.estadoGlobal === EstadoSemaforo.Verde) return DIAGNOSTICO_VERDE;

  const etiquetas = bucketsQueDrivenEstadoGlobal(resumen).map(
    (bucket) => ETIQUETA_BUCKET_COPY[bucket],
  );
  return `Tu mes está en ${PALABRA_ESTADO[resumen.estadoGlobal]} por ${listarEtiquetas(etiquetas)}.`;
}

/**
 * mensajeConsejo — A1 (`'excede'` / `'ahorro-bajo'`) or A2 (`'ahorro-alto'`)
 * template, per design §1.4. Ships the literal `{monto}` placeholder exactly
 * once (D-05, SEM-10) — the client substitutes it with the CLP-formatted
 * amount using the app's single money formatter. A2 uses ceiling semantics
 * (D-08b/D-09): liberating up to `{monto}` is what RETURNS the bucket to
 * Verde, never "sin salir de Verde" (which would misstate the bucket's
 * current Amarillo/Rojo state).
 */
function mensajeConsejo(
  bucket: Bucket,
  caso: CasoConsejo,
  direccion: DireccionConsejo,
): string {
  if (caso === 'ahorro-alto') {
    return 'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.';
  }
  const etiqueta =
    ETIQUETA_BUCKET_COPY[bucket as keyof typeof ETIQUETA_BUCKET_COPY];
  return `Para volver a Verde, ${VERBO[direccion]} {monto} en ${etiqueta} este mes.`;
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

/** Per-bucket detail row — the 3 rule buckets only (D-03). SinCategoria has no
 * band/estado/target, so its count+total travel in `SemaforoDetalle.sinCategoria`
 * instead of a 4th nullable-everything row. */
export interface BucketSemaforoDetalle {
  readonly bucket: Bucket;
  readonly total: bigint;
  readonly porcentajeBp: bigint | null;
  readonly estadoSemaforo: EstadoSemaforo | null;
  readonly bandas: BandasBucket;
  readonly consejo: ConsejoVerde | null;
}

export interface SemaforoDetalle {
  readonly totalIngreso: bigint;
  readonly sinIngreso: boolean;
  readonly estadoGlobal: EstadoSemaforo | null;
  readonly diagnostico: string;
  readonly bucketsCriticos: ReadonlyArray<Bucket>;
  readonly buckets: ReadonlyArray<BucketSemaforoDetalle>;
  readonly sinCategoria: { readonly cantidad: number; readonly total: bigint };
}

/**
 * construirSemaforoDetalle — assembles the full detail VO from an existing
 * `ResumenMes` (D-01: reuses the SAME reader/assembly as `/api/resumen`, no
 * second query path, no independently recomputed Sin categoría count/total —
 * SEM-05). `buckets` is exactly 3, fixed order (D-03).
 */
export function construirSemaforoDetalle(resumen: ResumenMes): SemaforoDetalle {
  const buckets: BucketSemaforoDetalle[] = BUCKETS_SEMAFORO_ORDEN.map(
    (bucket) => {
      const slice = resumen.buckets.find((s) => s.bucket === bucket);
      const total = slice?.total ?? 0n;
      return {
        bucket,
        total,
        porcentajeBp: slice?.porcentajeBp ?? null,
        estadoSemaforo: slice?.estadoSemaforo ?? null,
        bandas: BANDAS_SEMAFORO[bucket],
        consejo: montoParaVerde(bucket, total, resumen.totalIngreso),
      };
    },
  );

  const sinCategoriaSlice = resumen.buckets.find(
    (s) => s.bucket === Bucket.SinCategoria,
  );

  return {
    totalIngreso: resumen.totalIngreso,
    sinIngreso: resumen.sinIngreso,
    estadoGlobal: resumen.estadoGlobal,
    diagnostico: diagnosticar(resumen),
    bucketsCriticos: bucketsQueDrivenEstadoGlobal(resumen),
    buckets,
    sinCategoria: {
      cantidad: resumen.cantidadSinCategoria,
      total: sinCategoriaSlice?.total ?? 0n,
    },
  };
}
