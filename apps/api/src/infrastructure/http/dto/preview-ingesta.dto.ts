import { PreviewIngestaResult } from '../../../application/use-cases/preview-ingesta.use-case';

/**
 * PreviewTransaccionDto — forma HTTP de una fila de la muestra de preview.
 *
 * cargo/abono viajan como STRING (BigInt-safe), mismo contrato que
 * `TransaccionResponseDto` (ingesta-response.dto.ts) — deliberadamente NO se
 * comparte esa función (D7, design §5.2): confirm queda intocado, la
 * duplicación de 4 líneas triviales es preferible al acoplamiento entre
 * features.
 */
export interface PreviewTransaccionDto {
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
}

/** PreviewIngestaDto — contrato HTTP de POST /api/ingestas/preview. */
export interface PreviewIngestaDto {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  estructura: { totalFilasDatos: number };
  muestra: ReadonlyArray<PreviewTransaccionDto>;
}

/**
 * Mapea PreviewIngestaResult al contrato HTTP. NO re-capa `muestra` (D8): el
 * tope ≤50 es una decisión del use case (`PREVIEW_SAMPLE_MAX`), este mapper
 * solo serializa lo que recibe.
 */
export function aPreviewIngestaDto(
  data: PreviewIngestaResult,
): PreviewIngestaDto {
  return {
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    estructura: { totalFilasDatos: data.estructura.totalFilasDatos },
    muestra: data.muestra.map((tx) => ({
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    })),
  };
}
