/**
 * PersistenciaFallidaError — error de dominio.
 *
 * Representa la imposibilidad de persistir de forma durable una ingesta
 * y sus transacciones (por ejemplo, base de datos no disponible o
 * transacción atómica abortada). Es un error de dominio porque la
 * durabilidad de una ingesta es una garantía central del sistema (US-011).
 *
 * Se retorna vía Result desde application; nunca se lanza en dominio/application.
 */
export class PersistenciaFallidaError extends Error {
  constructor(
    public readonly motivo: string,
    public readonly causa?: Error,
  ) {
    super(`Persistencia fallida: ${motivo}`);
    this.name = 'PersistenciaFallidaError';
  }
}
