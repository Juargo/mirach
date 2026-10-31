/**
 * VersionAppInvalidaError — error de dominio.
 *
 * Se produce cuando una versión de app no sigue el formato MAJOR.MINOR.PATCH
 * numérico (p. ej. `1.10.0`).
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw input, which
 * may come from an arbitrary request header (`X-App-Version`).
 */
export class VersionAppInvalidaError extends Error {
  constructor() {
    super(
      'La versión de la app no es válida. Formato esperado: MAJOR.MINOR.PATCH (ej: 1.10.0).',
    );
    this.name = 'VersionAppInvalidaError';
  }
}
