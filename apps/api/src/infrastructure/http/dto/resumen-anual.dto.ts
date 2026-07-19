import { ResumenAnual } from '../../../domain/value-objects/resumen-anual';
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
 * The "YYYY-MM" periodo label for each month is derived from its index
 * (ResumenAnual.meses is guaranteed Jan→Dec order by PeriodoAnio.meses()) —
 * no need to carry the label inside the domain VO itself.
 */
export function aResumenAnualDto(resumenAnual: ResumenAnual): ResumenAnualDto {
  return {
    anio: resumenAnual.anio,
    meses: resumenAnual.meses.map((resumen, idx) => {
      const mm = String(idx + 1).padStart(2, '0');
      const periodo = `${resumenAnual.anio}-${mm}`;
      return aResumenMesDto(periodo, resumen);
    }),
  };
}
