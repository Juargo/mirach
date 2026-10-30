import { ResumenAnual } from '../../../domain/value-objects/resumen-anual';
import { PeriodoMes } from '../../../domain/value-objects/periodo-mes';
import { ResumenMesDto, aResumenMesDto } from './resumen-mes.dto';

/**
 * ResumenAnualDto — HTTP contract for GET /api/resumen/anual on success (US-030 Slice A).
 *
 * meses: always 12 entries, Jan→Dec. Each entry reuses ResumenMesDto/aResumenMesDto
 * (DRY) — no duplicated bucket/percentage/semáforo mapping logic.
 */
export interface ResumenAnualDto {
  readonly anio: number;
  readonly meses: ReadonlyArray<ResumenMesDto>;
}

/**
 * aResumenAnualDto — mapper from domain VO to HTTP DTO.
 *
 * `periodos` are the 12 financial months of the year (#111) in the same
 * Jan→Dec order as `ResumenAnual.meses` (both come from PeriodoAnio.meses()),
 * so each month carries its own label and start/end dates.
 */
export function aResumenAnualDto(
  resumenAnual: ResumenAnual,
  periodos: ReadonlyArray<PeriodoMes>,
): ResumenAnualDto {
  return {
    anio: resumenAnual.anio,
    meses: resumenAnual.meses.map((resumen, idx) =>
      aResumenMesDto(periodos[idx], resumen),
    ),
  };
}
