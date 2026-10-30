import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../errors/periodo-invalido.error';
import { DiaCorte } from './mes-financiero';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

const sumarDias = (fecha: Date, dias: number): Date =>
  new Date(fecha.getTime() + dias * MS_POR_DIA);

const fechaIso = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/**
 * PeriodoMes — value object de dominio.
 *
 * Encapsula la validación y el cálculo de los límites UTC de un período mensual
 * en formato YYYY-MM. Los límites son half-open: [desde, hasta).
 *
 * Mes financiero (#111, PER-08): con día de corte N, `YYYY-MM` es el período
 * que EMPIEZA el día N de ese mes y termina el día N−1 del mes siguiente
 * (corte 25: `2026-10` = 25 oct – 24 nov). El corte 1 es el mes calendario.
 * Con corte distinto de 1, un abono de ingreso que llega hasta 3 días antes
 * del corte cuenta en el período que empieza: la ventana de ingreso es
 * [desde − 3 días, hasta − 3 días).
 *
 * Invariantes garantizadas en construcción:
 *   - valor sigue el formato YYYY-MM con cero-padding.
 *   - desde = primer instante UTC del día de corte del mes (inclusive).
 *   - hasta = primer instante UTC del día de corte del mes siguiente (exclusive).
 *   - El mes está en rango [1, 12].
 *   - El año está en rango [2000, 2999].
 *
 * El value object es inmutable — no hay setters.
 */
export class PeriodoMes {
  private static readonly FORMATO = /^(\d{4})-(\d{2})$/;

  readonly ingresoDesde: Date;
  readonly ingresoHasta: Date;

  private constructor(
    readonly valor: string, // "YYYY-MM"
    readonly desde: Date, // primer instante del período, UTC (inclusive)
    readonly hasta: Date, // primer instante del período siguiente, UTC (exclusive)
    readonly diaCorte: DiaCorte,
  ) {
    this.ingresoDesde = sumarDias(desde, -diaCorte.toleranciaIngresoDias);
    this.ingresoHasta = sumarDias(hasta, -diaCorte.toleranciaIngresoDias);
  }

  /** First day of the period, `YYYY-MM-DD`. */
  get fechaInicio(): string {
    return fechaIso(this.desde);
  }

  /** Last day of the period (inclusive), `YYYY-MM-DD`. */
  get fechaFin(): string {
    return fechaIso(sumarDias(this.hasta, -1));
  }

  private static construir(
    year: number,
    month: number,
    diaCorte: DiaCorte,
  ): PeriodoMes {
    const valor = `${year}-${String(month).padStart(2, '0')}`;
    const desde = new Date(Date.UTC(year, month - 1, diaCorte.valor));
    // JS Date normalizes month index 12 → January of next year automatically
    const hasta = new Date(Date.UTC(year, month, diaCorte.valor));
    return new PeriodoMes(valor, desde, hasta, diaCorte);
  }

  /**
   * Para un parámetro de query presente.
   * Retorna Result para que el llamador maneje el error sin excepciones.
   */
  static crear(
    raw: string,
    diaCorte: DiaCorte = DiaCorte.CALENDARIO,
  ): Result<PeriodoMes, PeriodoInvalidoError> {
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

    return Result.ok(PeriodoMes.construir(year, month, diaCorte));
  }

  /** The period that contains `fecha` (UTC). */
  static queContiene(fecha: Date, diaCorte: DiaCorte): PeriodoMes {
    let year = fecha.getUTCFullYear();
    let month = fecha.getUTCMonth() + 1;
    if (fecha.getUTCDate() < diaCorte.valor) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return PeriodoMes.construir(year, month, diaCorte);
  }

  /** The period an income credit on `fecha` counts in (PER-08 tolerance). */
  static queContieneIngreso(fecha: Date, diaCorte: DiaCorte): PeriodoMes {
    return PeriodoMes.queContiene(
      sumarDias(fecha, diaCorte.toleranciaIngresoDias),
      diaCorte,
    );
  }

  /**
   * Para parámetro de query ausente — el período en curso (UTC).
   * Siempre tiene éxito; no retorna Result.
   */
  static actual(diaCorte: DiaCorte = DiaCorte.CALENDARIO): PeriodoMes {
    return PeriodoMes.queContiene(new Date(), diaCorte);
  }
}
