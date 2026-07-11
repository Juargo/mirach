/**
 * CategorizacionFallidaError — error de dominio.
 *
 * Representa la imposibilidad de cargar el catálogo de clasificación o de
 * escribir los resultados de bucket en la base de datos. Se usa únicamente
 * en las rutas de degradación (catalog-load fail / bucket-writer fail).
 * La clasificación por-transacción nunca produce este error: cae a SinCategoria.
 *
 * Se retorna vía Result desde application; nunca se lanza en dominio/application.
 */
export class CategorizacionFallidaError extends Error {
  constructor(
    public readonly motivo: string,
    public readonly causa?: Error,
  ) {
    super(`Categorización fallida: ${motivo}`);
    this.name = 'CategorizacionFallidaError';
  }
}
