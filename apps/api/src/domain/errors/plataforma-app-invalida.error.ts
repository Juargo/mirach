/**
 * PlataformaAppInvalidaError — error de dominio.
 *
 * Se produce cuando la plataforma de la app no es una de las soportadas
 * (`ios`, `android`).
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw input, which
 * may come from an arbitrary request header (`X-App-Platform`).
 */
export class PlataformaAppInvalidaError extends Error {
  constructor() {
    super(
      'La plataforma de la app no es válida. Valores aceptados: ios, android.',
    );
    this.name = 'PlataformaAppInvalidaError';
  }
}
