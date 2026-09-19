import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../ports/movimientos-mes.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { ILogger } from '../ports/logger.port';
import { resolverPeriodo } from './resolver-periodo';

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
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    periodo: string | undefined;
  }): Promise<Result<ObtenerMovimientosMesResult, PeriodoInvalidoError>> {
    // Parámetro ausente → último mes del usuario con datos (fallback mes
    // actual UTC); parámetro presente → validar con el VO.
    const periodoResult = await resolverPeriodo(
      this.ultimoPeriodoReader,
      input.userId,
      input.periodo,
    );
    if (periodoResult.isFail()) {
      return Result.fail(periodoResult.getError());
    }
    const periodoVO = periodoResult.getValue();

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
