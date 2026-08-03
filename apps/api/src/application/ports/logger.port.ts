/**
 * ILogger — port de aplicación para logging estructurado.
 *
 * Abstrae el mecanismo concreto (Pino; ver infrastructure/logging) para que la
 * capa de aplicación no dependa de infraestructura (ADR-005). El adapter se
 * inyecta desde la composition root.
 *
 * Desviación deliberada respecto a los demás ports: NO retorna Result. El
 * logging es fire-and-forget y best-effort — un fallo al emitir un log nunca
 * debe propagarse al flujo de negocio ni cambiar su resultado.
 *
 * El `context` opcional lleva campos estructurados. La implementación redacta
 * campos sensibles (montos, PII) antes de emitir (ADR-013).
 */
export interface LogContext {
  readonly [key: string]: unknown;
}

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const LOGGER = 'ILogger';
