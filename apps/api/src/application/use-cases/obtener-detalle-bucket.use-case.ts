import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { IDetalleBucketReader, DetalleBucketRow } from '../ports/detalle-bucket.port';

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
  constructor(private readonly reader: IDetalleBucketReader) {}

  async execute(input: {
    userId: string;
    bucket: string; // raw path param
    periodo: string | undefined;
  }): Promise<Result<ObtenerDetalleBucketResult, BucketInvalidoError | PeriodoInvalidoError>> {
    // 1. Validate :bucket against the Bucket enum first.
    if (!BUCKETS_VALIDOS.has(input.bucket)) {
      return Result.fail(new BucketInvalidoError(input.bucket));
    }
    const bucket = input.bucket as Bucket;

    // 2. Resolve periodo: undefined → PeriodoMes.actual(); present → PeriodoMes.crear().
    let periodoVO: PeriodoMes;
    if (input.periodo === undefined) {
      periodoVO = PeriodoMes.actual();
    } else {
      const resultado = PeriodoMes.crear(input.periodo);
      if (resultado.isFail()) {
        return Result.fail(resultado.getError());
      }
      periodoVO = resultado.getValue();
    }

    const transacciones = await this.reader.findByPeriodoYBucket(
      input.userId,
      periodoVO,
      bucket,
    );

    return Result.ok({
      periodo: periodoVO.valor,
      bucket,
      transacciones,
    });
  }
}
