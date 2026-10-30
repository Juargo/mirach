/**
 * DiaCorteInvalidoError — error de dominio.
 *
 * Se produce cuando el día de corte del mes financiero no es un entero entre
 * 1 y 28 (PER-08: "La persona elige un día entre el 1 y el 28").
 * HTTP: 400 `DIA_CORTE_INVALIDO`.
 */
export class DiaCorteInvalidoError extends Error {
  constructor() {
    super('El día de corte debe ser un número entre 1 y 28.');
    this.name = 'DiaCorteInvalidoError';
  }
}
