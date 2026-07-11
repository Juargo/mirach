import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../errors/periodo-invalido.error';

/**
 * PeriodoMes — value object de dominio.
 *
 * Encapsula la validación y el cálculo de los límites UTC de un período mensual
 * en formato YYYY-MM. Los límites son half-open: [desde, hasta).
 *
 * Invariantes garantizadas en construcción:
 *   - valor sigue el formato YYYY-MM con cero-padding.
 *   - desde = primer instante UTC del mes (inclusive).
 *   - hasta = primer instante UTC del mes siguiente (exclusive).
 *   - El mes está en rango [1, 12].
 *   - El año está en rango [2000, 2999].
 *
 * El value object es inmutable — no hay setters.
 */
export class PeriodoMes {
  private static readonly FORMATO = /^(\d{4})-(\d{2})$/;

  private constructor(
    readonly valor: string,   // "YYYY-MM"
    readonly desde: Date,     // primer instante del mes, UTC (inclusive)
    readonly hasta: Date,     // primer instante del mes siguiente, UTC (exclusive)
  ) {}

  /**
   * Para un parámetro de query presente.
   * Retorna Result para que el llamador maneje el error sin excepciones.
   */
  static crear(raw: string): Result<PeriodoMes, PeriodoInvalidoError> {
    const match = PeriodoMes.FORMATO.exec(raw);
    if (!match) {
      return Result.fail(new PeriodoInvalidoError(raw));
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);

    if (month < 1 || month > 12) {
      return Result.fail(new PeriodoInvalidoError(raw));
    }

    if (year < 2000 || year > 2999) {
      return Result.fail(new PeriodoInvalidoError(raw));
    }

    const desde = new Date(Date.UTC(year, month - 1, 1));
    // JS Date normalizes month index 12 → January of next year automatically
    const hasta = new Date(Date.UTC(year, month, 1));

    return Result.ok(new PeriodoMes(raw, desde, hasta));
  }

  /**
   * Para parámetro de query ausente — usa el mes UTC actual.
   * Siempre tiene éxito; no retorna Result.
   */
  static actual(): PeriodoMes {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const mm = String(month).padStart(2, '0');
    const valor = `${year}-${mm}`;
    const desde = new Date(Date.UTC(year, month - 1, 1));
    const hasta = new Date(Date.UTC(year, month, 1));
    return new PeriodoMes(valor, desde, hasta);
  }
}
