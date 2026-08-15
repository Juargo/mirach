import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../ports/movimientos-mes.port';
import { ILogger } from '../ports/logger.port';

/** Tipo de retorno del use case en caso de éxito. */
export interface ObtenerMovimientosMesResult {
  readonly periodo: string;
  readonly transacciones: ReadonlyArray<MovimientoMesRow>;
}

/**
 * ObtenerMovimientosMesUseCase — use case de lectura para US-014.
 *
 * Orquesta la validación del período y la consulta al reader.
 * Sin lógica de negocio propia: solo coordina el VO + el port.
 *
 * Retorna Result<ObtenerMovimientosMesResult, PeriodoInvalidoError>.
 * Un resultado vacío (sin transacciones) es éxito, no error (REQ-06).
 */
export class ObtenerMovimientosMesUseCase {
  constructor(
    private readonly reader: IMovimientosMesReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    periodo: string | undefined;
  }): Promise<Result<ObtenerMovimientosMesResult, PeriodoInvalidoError>> {
    let periodoVO: PeriodoMes;

    if (input.periodo === undefined) {
      // Parámetro ausente → mes actual UTC (siempre válido)
      periodoVO = PeriodoMes.actual();
    } else {
      // Parámetro presente → validar con el VO
      const resultado = PeriodoMes.crear(input.periodo);
      if (resultado.isFail()) {
        return Result.fail(resultado.getError());
      }
      periodoVO = resultado.getValue();
    }

    const transacciones = await this.reader.findByPeriodo(
      input.userId,
      periodoVO,
    );
    // Counts only — never montos/descripcion/numeroCuenta (ADR-013).
    this.logger.debug('obtener-movimientos-mes: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      transacciones: transacciones.length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      transacciones,
    });
  }
}
