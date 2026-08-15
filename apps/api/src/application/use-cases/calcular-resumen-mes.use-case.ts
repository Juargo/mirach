import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { ResumenMes } from '../../domain/value-objects/resumen-mes';
import { IResumenMesReader } from '../ports/resumen-mes.port';
import { ILogger } from '../ports/logger.port';
import { construirResumenMesDesdeFilas } from './resumen-mes-assembly';

/** Tipo de retorno del use case en caso de éxito — mirrors US-014 pattern. */
export interface CalcularResumenMesResult {
  readonly periodo: string;
  readonly resumen: ResumenMes;
}

/**
 * CalcularResumenMesUseCase — use case de lectura para US-015.
 *
 * Orquesta la validación del período, la consulta al reader, y la construcción
 * del ResumenMes VO con los porcentajes 50/30/20 calculados en BigInt.
 *
 * Flow:
 *   1. Resolve periodo: absent → PeriodoMes.actual(); present → PeriodoMes.crear()
 *   2. Call reader.sumarPorBucket(userId, periodoVO)
 *   3. Extract totalIngreso from Ingreso row's totalAbono (0n if absent)
 *   4. For each spend bucket: total = totalCargo of that row (0n if absent)
 *   5. Build ResumenMes.crear(...) → VO computes percentages via helper
 *   6. Return Result.ok({ periodo, resumen })
 *
 * Never throws. Never imports from infrastructure.
 */
export class CalcularResumenMesUseCase {
  constructor(
    private readonly reader: IResumenMesReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    periodo: string | undefined;
  }): Promise<Result<CalcularResumenMesResult, PeriodoInvalidoError>> {
    let periodoVO: PeriodoMes;

    if (input.periodo === undefined) {
      // Absent → current UTC month (always valid)
      periodoVO = PeriodoMes.actual();
    } else {
      // Present → validate with VO
      const resultado = PeriodoMes.crear(input.periodo);
      if (resultado.isFail()) {
        return Result.fail(resultado.getError());
      }
      periodoVO = resultado.getValue();
    }

    const rows = await this.reader.sumarPorBucket(input.userId, periodoVO);
    // Counts only — never amounts (ADR-013). Row count reflects how many of
    // the up-to-5 bucket-sum rows the reader returned for this period.
    this.logger.debug('calcular-resumen-mes: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      rows: rows.length,
    });

    const resumen = construirResumenMesDesdeFilas(rows);
    this.logger.debug('calcular-resumen-mes: computed', {
      periodo: periodoVO.valor,
      estadoGlobal: resumen.estadoGlobal,
      bucketsConDatos: resumen.buckets.filter((b) => b.total > 0n).length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      resumen,
    });
  }
}
