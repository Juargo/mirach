import { Result } from '../../shared/result';
import { ResumenMes } from './resumen-mes';
import { ResumenAnualInvalidoError } from '../errors/resumen-anual-invalido.error';

/** meses MUST be exactly 12 entries — enforced by crear(). */
const CANTIDAD_MESES_ESPERADA = 12;

/**
 * ResumenAnual — domain value object for the 50/30/20 annual breakdown (US-030).
 *
 * Holds exactly 12 ResumenMes (Enero→Diciembre) for a given year. Does NOT
 * reimplement any 50/30/20 or semáforo logic — each ResumenMes is built via
 * the existing ResumenMes.crear() construction (reused from US-015/016).
 *
 * Immutable; construction via static `crear()` which fails closed with
 * ResumenAnualInvalidoError when `meses.length !== 12` (a month with no data
 * still yields a zeroed/sinIngreso ResumenMes — that's a valid entry, not a
 * missing one). ResumenMes carries no periodo/month field of its own, so
 * ascending Enero→Diciembre order is NOT verified here — it is the calling
 * use case's contract (CalcularResumenAnualUseCase builds meses by iterating
 * PeriodoAnio.meses(), which is guaranteed ascending).
 */
export class ResumenAnual {
  private constructor(
    readonly anio: number,
    readonly meses: ReadonlyArray<ResumenMes>,
  ) {}

  /** meses MUST be exactly 12 entries, ordered Enero→Diciembre. */
  static crear(
    anio: number,
    meses: ReadonlyArray<ResumenMes>,
  ): Result<ResumenAnual, ResumenAnualInvalidoError> {
    if (meses.length !== CANTIDAD_MESES_ESPERADA) {
      return Result.fail(new ResumenAnualInvalidoError(meses.length));
    }

    return Result.ok(new ResumenAnual(anio, meses));
  }
}
