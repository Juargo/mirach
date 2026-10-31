/**
 * VersionConsentimientoInvalidaError — error de dominio.
 *
 * Se produce cuando la versión de un documento aceptado no tiene el formato
 * esperado, o cuando un alta trae la versión de términos sin la de privacidad
 * (o al revés). HTTP: 400 `VERSION_CONSENTIMIENTO_INVALIDA`.
 */
export class VersionConsentimientoInvalidaError extends Error {
  constructor() {
    super('La versión del consentimiento no es válida.');
    this.name = 'VersionConsentimientoInvalidaError';
  }
}
