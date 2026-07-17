/**
 * BucketInvalidoError — error de dominio.
 *
 * Se produce cuando el `:bucket` recibido en la ruta no corresponde a ninguno
 * de los valores del enum `Bucket` (US-017). Es un error de dominio porque
 * validar el bucket contra el catálogo conocido es una regla de negocio
 * central de la consulta de detalle.
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw user input
 * (mirrors PeriodoInvalidoError). Raw user input is stored in `rawValue` for
 * server-side logging only and MUST NOT be forwarded to HTTP responses
 * (prevents reflected-input in 400 bodies).
 */
export class BucketInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super(
      'El bucket no es válido. Valores esperados: Necesidades, Deseos, Ahorro, Ingreso, SinCategoria.',
    );
    this.name = 'BucketInvalidoError';
    this.rawValue = raw;
  }
}
