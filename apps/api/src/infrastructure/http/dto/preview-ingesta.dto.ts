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

/** PreviewIngestaDto — HTTP contract for POST /api/ingestas/preview (US-057 PR2). */
export interface PreviewIngestaDto {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  resumen: PreviewResumenDto;
  filas: ReadonlyArray<PreviewTransaccionDto>;
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
 * Maps PreviewIngestaResult to the HTTP contract.
 *
 * US-057 PR2: result shape changed from { banco, estructura, muestra } to
 * { banco, resumen, filas } with per-row dedup and classification suggestion.
 * The 50-cap (PREVIEW_SAMPLE_MAX) was removed in US-057 — all rows are
 * returned. This mapper serialises what it receives without re-capping.
 *
 * Full HTTP formalisation (openapi.json, zod schemas) is PR4/5.
 */
export function aPreviewIngestaDto(
  data: PreviewIngestaResult,
): PreviewIngestaDto {
  return {
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    resumen: {
      totalFilas: data.resumen.totalFilas,
      duplicadosDetectados: data.resumen.duplicadosDetectados,
      nuevas: data.resumen.nuevas,
    },
    filas: data.filas.map(aPreviewFilaDto),
  };
}
