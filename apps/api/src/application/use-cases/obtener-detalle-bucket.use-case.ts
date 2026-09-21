import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../ports/detalle-bucket.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { ILogger } from '../ports/logger.port';
import { resolverPeriodo } from './resolver-periodo';

/** Tipo de retorno del use case en caso de éxito. */
export interface ObtenerDetalleBucketResult {
  readonly periodo: string;
  readonly bucket: Bucket;
  readonly transacciones: ReadonlyArray<DetalleBucketRow>;
}

const BUCKETS_VALIDOS: ReadonlySet<string> = new Set(Object.values(Bucket));

/**
 * ObtenerDetalleBucketUseCase — use case de lectura para US-017.
 *
 * Orquesta la validación del `:bucket` (path param) y del período opcional,
 * y la consulta al reader. Thin coordinator — mirrors
 * ObtenerMovimientosMesUseCase / CalcularResumenMesUseCase.
 *
 * Retorna Result<ObtenerDetalleBucketResult, BucketInvalidoError | PeriodoInvalidoError>.
 * Un resultado vacío (sin transacciones) es éxito, no error. Nunca lanza.
 */
export class ObtenerDetalleBucketUseCase {
  constructor(
    private readonly reader: IDetalleBucketReader,
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    bucket: string; // raw path param
    periodo: string | undefined;
  }): Promise<
    Result<
      ObtenerDetalleBucketResult,
      BucketInvalidoError | PeriodoInvalidoError
    >
  > {
    // 1. Validate :bucket against the Bucket enum first.
    if (!BUCKETS_VALIDOS.has(input.bucket)) {
      return Result.fail(new BucketInvalidoError(input.bucket));
    }
    const bucket = input.bucket as Bucket;

    // 2. Resolve periodo via resolverPeriodo: undefined → user's latest
    //    month with data (fallback PeriodoMes.actual()); present → PeriodoMes.crear().
    const periodoResult = await resolverPeriodo(
      this.ultimoPeriodoReader,
      input.userId,
      input.periodo,
    );
    if (periodoResult.isFail()) {
      return Result.fail(periodoResult.getError());
    }
    const periodoVO = periodoResult.getValue();

    const transacciones = await this.reader.findByPeriodoYBucket(
      input.userId,
      periodoVO,
      bucket,
    );
    // Counts only — never montos/descripcion/numeroCuenta (ADR-013).
    this.logger.debug('obtener-detalle-bucket: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      bucket,
      transacciones: transacciones.length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      bucket,
      transacciones,
    });
  }
}
