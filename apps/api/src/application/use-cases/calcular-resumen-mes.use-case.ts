import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { ResumenMes } from '../../domain/value-objects/resumen-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import {
  IResumenMesReader,
  BucketSumRow,
} from '../ports/resumen-mes.port';

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
  constructor(private readonly reader: IResumenMesReader) {}

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

    // Index rows by Bucket for O(1) lookup
    const rowMap = new Map<Bucket, BucketSumRow>();
    for (const row of rows) {
      rowMap.set(row.bucket, row);
    }

    // Income base = Ingreso bucket's totalAbono (0n if month has no income rows)
    const totalIngreso = rowMap.get(Bucket.Ingreso)?.totalAbono ?? 0n;

    // Spend sums: use totalCargo for each spend bucket (0n if row absent)
    const necesidades = rowMap.get(Bucket.Necesidades)?.totalCargo ?? 0n;
    const deseos = rowMap.get(Bucket.Deseos)?.totalCargo ?? 0n;
    const ahorro = rowMap.get(Bucket.Ahorro)?.totalCargo ?? 0n;
    const sinCategoria = rowMap.get(Bucket.SinCategoria)?.totalCargo ?? 0n;

    const resumen = ResumenMes.crear({
      totalIngreso,
      necesidades,
      deseos,
      ahorro,
      sinCategoria,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      resumen,
    });
  }
}
