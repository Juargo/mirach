import { Result } from '../../shared/result';
import { AnioInvalidoError } from '../errors/anio-invalido.error';
import { PeriodoMes } from './periodo-mes';

/**
 * PeriodoAnio — value object de dominio.
 *
 * Encapsula la validación y el cálculo de los límites UTC de un período anual
 * (para el resumen 50/30/20 anual, US-030). Mirrors PeriodoMes.
 *
 * Invariantes garantizadas en construcción:
 *   - anio es un entero en rango [2000, 2100].
 *   - desde = primer instante UTC del año (inclusive).
 *   - hasta = primer instante UTC del año siguiente (exclusive).
 *
 * El value object es inmutable — no hay setters.
 */
export class PeriodoAnio {
  private static readonly ANIO_MIN = 2000;
  private static readonly ANIO_MAX = 2100;

  private constructor(
    readonly anio: number,
    readonly desde: Date, // primer instante del año, UTC (inclusive)
    readonly hasta: Date, // primer instante del año siguiente, UTC (exclusive)
  ) {}

  /**
   * Para un parámetro de query presente.
   * Retorna Result para que el llamador maneje el error sin excepciones.
   */
  static crear(anio: number): Result<PeriodoAnio, AnioInvalidoError> {
    if (!Number.isInteger(anio)) {
      return Result.fail(new AnioInvalidoError(anio));
    }

    if (anio < PeriodoAnio.ANIO_MIN || anio > PeriodoAnio.ANIO_MAX) {
      return Result.fail(new AnioInvalidoError(anio));
    }

    const desde = new Date(Date.UTC(anio, 0, 1));
    const hasta = new Date(Date.UTC(anio + 1, 0, 1));

    return Result.ok(new PeriodoAnio(anio, desde, hasta));
  }

  /**
   * Para parámetro de query ausente — usa el año UTC actual.
   * Siempre tiene éxito; no retorna Result.
   */
  static actual(): PeriodoAnio {
    const now = new Date();
    const anio = now.getUTCFullYear();
    const desde = new Date(Date.UTC(anio, 0, 1));
    const hasta = new Date(Date.UTC(anio + 1, 0, 1));
    return new PeriodoAnio(anio, desde, hasta);
  }

  /**
   * Los 12 PeriodoMes del año, Enero→Diciembre.
   *
   * Reutiliza PeriodoMes.crear() (DRY) — siempre tiene éxito porque el rango
   * de PeriodoAnio [2000, 2100] es un subconjunto del rango de PeriodoMes
   * [2000, 2999].
   */
  meses(): readonly PeriodoMes[] {
    const meses: PeriodoMes[] = [];
    for (let mes = 1; mes <= 12; mes++) {
      const valor = `${this.anio}-${String(mes).padStart(2, '0')}`;
      const resultado = PeriodoMes.crear(valor);
      // Never fails: this.anio ∈ [2000, 2100] ⊂ PeriodoMes valid range [2000, 2999].
      meses.push(resultado.getValue());
    }
    return meses;
  }
}
