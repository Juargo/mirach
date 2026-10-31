/**
 * ConsentimientoCartolasRequeridoError — error de dominio.
 *
 * Se produce cuando se intenta importar una cartola sin un consentimiento de
 * cartolas vigente (PRI-02, PRI-06). HTTP: 409
 * `CONSENTIMIENTO_CARTOLAS_REQUERIDO`.
 */
export class ConsentimientoCartolasRequeridoError extends Error {
  constructor() {
    super('Debes aceptar el procesamiento de cartolas antes de importar.');
    this.name = 'ConsentimientoCartolasRequeridoError';
  }
}
