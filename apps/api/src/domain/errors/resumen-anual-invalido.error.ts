/**
 * ResumenAnualInvalidoError — error de dominio.
 *
 * Se produce cuando el conjunto de ResumenMes provisto a ResumenAnual.crear()
 * no tiene exactamente 12 entradas (invariante Enero→Diciembre del resumen
 * anual, US-030). Mirrors AnioInvalidoError — error de dominio porque la
 * forma del resumen anual es una regla de negocio central, no un detalle
 * técnico.
 *
 * Design note: this is a fail-closed defensive invariant. In normal operation
 * it can never actually fail — PeriodoAnio.meses() always returns exactly 12
 * entries and the use case's .map() preserves length — but it exists so a
 * future bug in that assembly path is caught at construction instead of
 * silently mislabeling/truncating months downstream.
 */
export class ResumenAnualInvalidoError extends Error {
  /** The actual length received, for server-side logging only. */
  readonly cantidadRecibida: number;

  constructor(cantidadRecibida: number) {
    super('ResumenAnual requiere exactamente 12 meses (Enero→Diciembre).');
    this.name = 'ResumenAnualInvalidoError';
    this.cantidadRecibida = cantidadRecibida;
  }
}
