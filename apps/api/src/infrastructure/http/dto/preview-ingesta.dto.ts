import {
  PreviewIngestaResult,
  PreviewFila,
} from '../../../application/use-cases/preview-ingesta.use-case';

/**
 * PreviewTransaccionDto — HTTP form of a single preview row (US-057 PR2).
 *
 * cargo/abono travel as STRING (BigInt-safe), same contract as
 * `TransaccionResponseDto` (ingesta-response.dto.ts) — deliberately NOT
 * shared (D7: trivial duplication is preferable to coupling two features).
 *
 * US-057 PR2: extended with dedup status and classification suggestion.
 * The `sugerido` field is null when there is no match or the bucket is
 * SinCategoria (D-09). Full HTTP contract formalisation is PR4/5
 * (openapi.json + zod schemas updated there).
 */
export interface PreviewTransaccionDto {
  rowIndex: number;
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
  esDuplicado: boolean;
  sugerido: { bucket: string; categoriaId: string | null } | null;
}

/** Resumen agregado HTTP mirror of PreviewResumen (spec PREV-EXT-01). */
export interface PreviewResumenDto {
  totalFilas: number;
  duplicadosDetectados: number;
  nuevas: number;
}

/**
 * LEGACY row shape — the pre-US-057 `muestra[]` element (US-003). Carries
 * ONLY the four original fields (no rowIndex/esDuplicado/sugerido).
 *
 * @deprecated Compat shim (product decision 2026-08-21). Kept so shipped
 * clients (deployed mobile APK, web/mobile before their migration) keep
 * working. Physical removal is tracked by US-061 alongside the one-shot
 * endpoint. New consumers MUST read `filas`.
 */
export interface PreviewTransaccionLegacyDto {
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
}

/**
 * LEGACY aggregate — the pre-US-057 `estructura` object (US-003).
 *
 * @deprecated Compat shim (product decision 2026-08-21). `totalFilasDatos`
 * is the same value as `resumen.totalFilas`. Removed by US-061. New consumers
 * MUST read `resumen`.
 */
export interface PreviewEstructuraLegacyDto {
  totalFilasDatos: number;
}

/**
 * Legacy 50-row sample cap preserved for backward compatibility. The canonical
 * `filas` field returns the FULL set (uncapped, US-057); only the deprecated
 * `muestra` mirror keeps the old ≤50 semantics.
 */
const LEGACY_MUESTRA_MAX = 50;

/**
 * PreviewIngestaDto — HTTP contract for POST /api/ingestas/preview.
 *
 * BACKWARD-COMPATIBLE (product decision 2026-08-21): carries BOTH shapes.
 * - CANONICAL (US-057): `resumen` + `filas` (full set, per-row dedup/suggestion).
 * - LEGACY (@deprecated, removed by US-061): `estructura` + `muestra` (first 50
 *   rows, old 4-field shape) — for shipped clients that cannot be updated by
 *   repo code (deployed mobile APK) and clients pending migration.
 */
export interface PreviewIngestaDto {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  resumen: PreviewResumenDto;
  filas: ReadonlyArray<PreviewTransaccionDto>;
  /** @deprecated Legacy mirror of `resumen.totalFilas`. Removed by US-061. */
  estructura: PreviewEstructuraLegacyDto;
  /** @deprecated Legacy first-50-rows sample in the old shape. Removed by US-061. */
  muestra: ReadonlyArray<PreviewTransaccionLegacyDto>;
}

/** Maps PreviewFila to its HTTP representation. */
function aPreviewFilaDto(fila: PreviewFila): PreviewTransaccionDto {
  const { rowIndex, transaccion: tx, esDuplicado, sugerido } = fila;
  return {
    rowIndex,
    fecha: tx.fecha.toISOString(),
    descripcion: tx.descripcion,
    cargo: String(tx.cargo),
    abono: String(tx.abono),
    esDuplicado,
    sugerido:
      sugerido !== null
        ? {
            // Bucket is a string enum — its value IS the wire string (no reverse lookup).
            bucket: sugerido.bucket,
            categoriaId: sugerido.categoriaId,
          }
        : null,
  };
}

/**
 * Derives the deprecated `muestra` row from a canonical `filas` row: keeps ONLY
 * the four legacy fields, dropping rowIndex/esDuplicado/sugerido. Compat shim.
 */
function aMuestraLegacyDto(
  fila: PreviewTransaccionDto,
): PreviewTransaccionLegacyDto {
  return {
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    cargo: fila.cargo,
    abono: fila.abono,
  };
}

/**
 * Maps PreviewIngestaResult to the HTTP contract.
 *
 * US-057: canonical shape is `{ banco, resumen, filas }` with per-row dedup and
 * classification suggestion; `filas` returns ALL rows (the old 50-cap was
 * removed). Compat shim (product decision 2026-08-21): the deprecated legacy
 * `estructura`/`muestra` mirror is derived here so shipped clients keep working
 * until US-061 removes it. The use case is untouched — it already produces
 * everything needed; the legacy view is a pure projection at this boundary.
 */
export function aPreviewIngestaDto(
  data: PreviewIngestaResult,
): PreviewIngestaDto {
  const filas = data.filas.map(aPreviewFilaDto);
  return {
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    resumen: {
      totalFilas: data.resumen.totalFilas,
      duplicadosDetectados: data.resumen.duplicadosDetectados,
      nuevas: data.resumen.nuevas,
    },
    filas,
    // Legacy mirror (@deprecated, US-061). estructura.totalFilasDatos ===
    // resumen.totalFilas; muestra = first 50 rows in the old 4-field shape.
    estructura: { totalFilasDatos: data.resumen.totalFilas },
    muestra: filas.slice(0, LEGACY_MUESTRA_MAX).map(aMuestraLegacyDto),
  };
}
