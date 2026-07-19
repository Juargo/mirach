import { Result } from '../../shared/result';
import { PeriodoAnio } from '../../domain/value-objects/periodo-anio';
import { AnioInvalidoError } from '../../domain/errors/anio-invalido.error';
import { ResumenAnual } from '../../domain/value-objects/resumen-anual';
import { ResumenAnualInvalidoError } from '../../domain/errors/resumen-anual-invalido.error';
import {
  IResumenAnualReader,
  BucketSumRowAnual,
} from '../ports/resumen-anual.port';
import { construirResumenMesDesdeFilas } from './resumen-mes-assembly';

/** Tipo de retorno del use case en caso de éxito — mirrors CalcularResumenMesResult. */
export interface CalcularResumenAnualResult {
  readonly anio: number;
  readonly resumenAnual: ResumenAnual;
}

/**
 * CalcularResumenAnualUseCase — use case de lectura para US-030 (Slice A).
 *
 * Orquesta la validación del año, la consulta al reader (UNA sola query para
 * los 12 meses), y el ensamblaje de 12 ResumenMes reutilizando exactamente la
 * misma construcción 50/30/20 + semáforo que el resumen mensual (US-015/016).
 * No reimplementa esa lógica — delega en construirResumenMesDesdeFilas.
 *
 * Flow:
 *   1. Resolve anio: absent → PeriodoAnio.actual(); present → parse + PeriodoAnio.crear()
 *   2. Call reader.sumarPorBucketAnual(userId, anioVO) — one query for the whole year
 *   3. Group rows by mes ("YYYY-MM")
 *   4. For each of the 12 PeriodoMes (anioVO.meses(), Jan→Dec): build a
 *      ResumenMes from that month's rows (empty → zeroed sinIngreso ResumenMes)
 *   5. Return Result.ok({ anio, resumenAnual })
 *
 * Never throws. Never imports from infrastructure. userId isolation is
 * structural — passed straight through to the reader, never a fixed constant.
 */
/** Canonical 4-digit year format — mirrors PeriodoMes's strict ^(\d{4})-(\d{2})$ approach. */
const FORMATO_ANIO = /^\d{4}$/;

export class CalcularResumenAnualUseCase {
  constructor(private readonly reader: IResumenAnualReader) {}

  async execute(input: {
    userId: string;
    anio: string | undefined;
  }): Promise<
    Result<
      CalcularResumenAnualResult,
      AnioInvalidoError | ResumenAnualInvalidoError
    >
  > {
    let anioVO: PeriodoAnio;

    if (input.anio === undefined) {
      // Absent → current UTC year (always valid)
      anioVO = PeriodoAnio.actual();
    } else {
      // Present → require canonical 4-digit format BEFORE coercing to number.
      // Number() alone would silently accept "2e3" (→2000), "0x7ea" (→2026),
      // " 2026 " (trimmed), etc. — reject anything that isn't exactly \d{4}.
      if (!FORMATO_ANIO.test(input.anio)) {
        return Result.fail(new AnioInvalidoError(NaN));
      }

      const parsed = Number(input.anio);
      const resultado = PeriodoAnio.crear(parsed);
      if (resultado.isFail()) {
        return Result.fail(resultado.getError());
      }
      anioVO = resultado.getValue();
    }

    const rows = await this.reader.sumarPorBucketAnual(input.userId, anioVO);

    // Group rows by "YYYY-MM" for O(1) lookup per month
    const rowsPorMes = new Map<string, BucketSumRowAnual[]>();
    for (const row of rows) {
      const lista = rowsPorMes.get(row.mes) ?? [];
      lista.push(row);
      rowsPorMes.set(row.mes, lista);
    }

    const meses = anioVO
      .meses()
      .map((periodoMes) =>
        construirResumenMesDesdeFilas(rowsPorMes.get(periodoMes.valor) ?? []),
      );

    const resultadoResumenAnual = ResumenAnual.crear(anioVO.anio, meses);
    if (resultadoResumenAnual.isFail()) {
      return Result.fail(resultadoResumenAnual.getError());
    }

    return Result.ok({
      anio: anioVO.anio,
      resumenAnual: resultadoResumenAnual.getValue(),
    });
  }
}
