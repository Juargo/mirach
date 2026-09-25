/**
 * BucketNoAsignableError — error de dominio.
 *
 * Se produce cuando el `bucket` recibido al crear o actualizar una categoría
 * no es uno de los tres buckets asignables (`Necesidades`/`Deseos`/`Ahorro`).
 * Cubre `bucket` faltante, desconocido, y el estado computado `Ingreso`,
 * que NO es asignable (CAT038-01) — `SinCategoria` cubría el mismo caso
 * hasta que issue #778 tramo 5b PR5 lo removió del dominio. El mensaje enumera los
 * valores válidos porque `Bucket` es una taxonomía global fija, no un dato
 * de usuario — enumerarla no es anti-enumeration risk. Ver design.md §5.2.
 */
export class BucketNoAsignableError extends Error {
  /** The original raw input, for server-side logging only. */
  readonly rawValue: string | undefined;

  constructor(raw: string | undefined) {
    super('El bucket debe ser uno de: Necesidades, Deseos, Ahorro.');
    this.name = 'BucketNoAsignableError';
    this.rawValue = raw;
  }
}
