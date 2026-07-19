/**
 * CategoriaInvalidaError — error de dominio.
 *
 * Se produce cuando el `categoria` recibido en el body del endpoint de
 * reclasificación manual (US-013, CATAPI-02) no corresponde a ninguno de los
 * valores del enum `Categoria`. Es un error de dominio porque validar la
 * categoría contra el catálogo conocido es una regla de negocio central del
 * reclasificar.
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw user
 * input (mirrors BucketInvalidoError / PeriodoInvalidoError). Raw user input
 * is stored in `rawValue` for server-side logging only and MUST NOT be
 * forwarded to HTTP responses (prevents reflected-input in 400 bodies).
 */
export class CategoriaInvalidaError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super(
      'La categoría no es válida. Valores esperados: Supermercado, Combustible, Farmacia, Salud, Transporte, Streaming, Delivery, Ahorro.',
    );
    this.name = 'CategoriaInvalidaError';
    this.rawValue = raw;
  }
}
