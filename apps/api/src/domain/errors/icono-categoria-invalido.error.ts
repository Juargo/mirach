/**
 * IconoCategoriaInvalidoError — error de dominio.
 *
 * Se produce cuando el `icono` recibido al crear o actualizar una categoría
 * no pertenece al allowlist curado (CATICO-01/02/03, ADR-045). A diferencia
 * de `BucketNoAsignableError` (una taxonomía fija de 5 valores, sin riesgo
 * de enumerarla), `icono` es un input arbitrario de usuario — el mensaje
 * NUNCA repite el valor recibido; `rawValue` queda disponible aparte, solo
 * para logging server-side (layer-honesty gate, ver design.md D-07).
 */
export class IconoCategoriaInvalidoError extends Error {
  /** The original raw input, for server-side logging only — never echoed in message. */
  readonly rawValue: string | null | undefined;

  constructor(raw: string | null | undefined) {
    super('El icono debe pertenecer al catálogo de íconos permitidos.');
    this.name = 'IconoCategoriaInvalidoError';
    this.rawValue = raw;
  }
}
