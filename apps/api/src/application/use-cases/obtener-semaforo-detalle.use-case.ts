import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import {
  construirSemaforoDetalle,
  SemaforoDetalle,
} from '../../domain/value-objects/semaforo-detalle';
import { IResumenMesReader } from '../ports/resumen-mes.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { ILogger } from '../ports/logger.port';
import { construirResumenMesDesdeFilas } from './resumen-mes-assembly';
import { resolverPeriodo } from './resolver-periodo';

/** Tipo de retorno del use case en caso de éxito — mirrors CalcularResumenMesUseCase. */
export interface ObtenerSemaforoDetalleResult {
  readonly periodo: string;
  readonly detalle: SemaforoDetalle;
}

/**
 * ObtenerSemaforoDetalleUseCase — use case de lectura para US-049 (design §1.5).
 *
 * Mirrors CalcularResumenMesUseCase step for step: reuses the SAME
 * IResumenMesReader port and the SAME construirResumenMesDesdeFilas assembly
 * (D-01 — no second query path), then hands the resulting ResumenMes to the
 * new domain module `construirSemaforoDetalle` for the semáforo detail VO.
 *
 * `PeriodoInvalidoError` is the ONLY error case. A month with no income is a
 * valid Result.ok with `sinIngreso: true` (CA-07) — same discipline as
 * `/api/resumen`'s SC-04.
 *
 * Never throws. Never imports from infrastructure.
 */
export class ObtenerSemaforoDetalleUseCase {
  constructor(
    private readonly reader: IResumenMesReader,
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    periodo: string | undefined;
  }): Promise<Result<ObtenerSemaforoDetalleResult, PeriodoInvalidoError>> {
    const periodoResult = await resolverPeriodo(
      this.ultimoPeriodoReader,
      input.userId,
      input.periodo,
    );
    if (periodoResult.isFail()) {
      return Result.fail(periodoResult.getError());
    }
    const periodoVO = periodoResult.getValue();

    const rows = await this.reader.sumarPorBucket(input.userId, periodoVO);
    // Counts only — never amounts (ADR-013). Row count reflects how many of
    // the up-to-5 bucket-sum rows the reader returned for this period.
    this.logger.debug('obtener-semaforo-detalle: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      rows: rows.length,
    });

    const resumen = construirResumenMesDesdeFilas(rows);
    const detalle = construirSemaforoDetalle(resumen);
    this.logger.debug('obtener-semaforo-detalle: computed', {
      periodo: periodoVO.valor,
      estadoGlobal: detalle.estadoGlobal,
      bucketsCriticos: detalle.bucketsCriticos.length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      detalle,
    });
  }
}
