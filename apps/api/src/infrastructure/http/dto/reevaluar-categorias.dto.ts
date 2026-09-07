import { ReevaluarCategoriasResult } from '../../../application/use-cases/reevaluar-categorias.use-case';

/**
 * ReevaluarCategoriasResponseDto — contrato HTTP de éxito (200) de
 * `POST /api/transacciones/reevaluar`.
 *
 * Solo conteos — nunca ids, descripciones ni montos de transacciones
 * individuales (ADR-013).
 */
export interface ReevaluarCategoriasResponseDto {
  readonly transaccionesEvaluadas: number;
  readonly transaccionesActualizadas: number;
}

/** Mapea el resultado del use case al contrato HTTP (copia directa, sin transformación). */
export function aReevaluarCategoriasDto(
  data: ReevaluarCategoriasResult,
): ReevaluarCategoriasResponseDto {
  return {
    transaccionesEvaluadas: data.transaccionesEvaluadas,
    transaccionesActualizadas: data.transaccionesActualizadas,
  };
}
