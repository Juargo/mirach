import pino from 'pino';
import type { ILogger, LogContext } from '../../application/ports/logger.port';

/**
 * Rutas redactadas antes de emitir (ADR-013): montos y PII nunca llegan a
 * stdout en crudo. Cubre claves conocidas a nivel raíz, un nivel de anidamiento
 * (`*.campo`) y los headers de request que arrastran credenciales.
 */
export const SENSITIVE_REDACT_PATHS = [
  'cargo',
  'abono',
  'monto',
  'montos',
  'email',
  'numeroCuenta',
  'rut',
  'password',
  // US-040 (D-07): `nombre` es PII en claro — ADR-013 solo cifra
  // email/numeroCuenta, no `User.nombre`. Defensa en profundidad: la regla
  // real sigue siendo loguear nombres de campo/booleans, nunca el valor
  // (ver `ActualizarPerfilUseCase`/`CambiarPasswordUseCase`).
  'nombre',
  'authorization',
  'cookie',
  '*.cargo',
  '*.abono',
  '*.monto',
  '*.email',
  '*.numeroCuenta',
  '*.rut',
  '*.password',
  '*.nombre',
  'req.headers.authorization',
  'req.headers.cookie',
  // `x-api-key` es hyphenated → requiere notación de corchetes (sintaxis de
  // pino redact). Gatea TODO /api (`apiKeyMiddleware`); sin esto quedaba en
  // crudo en cada línea de request logging (4R post-review, R1 WARNING).
  'req.headers["x-api-key"]',
  // `set-cookie` es hyphenated → requiere notación de corchetes (sintaxis
  // de pino redact). pino-http serializa los headers de respuesta bajo
  // `res.headers`; sin esto, `Set-Cookie` (con el token de sesión) queda
  // en crudo en cada línea de request logging.
  'res.headers["set-cookie"]',
];

/**
 * Adapter Pino del port ILogger. El `context` va como merging object de Pino
 * (primer argumento), de modo que sus claves quedan sujetas a la redacción.
 */
export class PinoLogger implements ILogger {
  constructor(private readonly logger: pino.Logger) {}

  /**
   * Instancia pino nativa subyacente. Existe SOLO para colaboradores que
   * necesitan el objeto `pino.Logger` real (p. ej. `pino-http`, que no
   * conoce el port `ILogger`) — el resto del código consume siempre la
   * interfaz `ILogger`, nunca esto.
   */
  get raw(): pino.Logger {
    return this.logger;
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context ?? {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context ?? {}, message);
  }
}

export interface CreatePinoLoggerOptions {
  /** `pino-pretty` legible (dev). En prod se deja JSON a stdout (ADR-029). */
  readonly pretty?: boolean;
  readonly level?: string;
  /** Destino alternativo (tests capturan el stream). Excluye `pretty`. */
  readonly destination?: pino.DestinationStream;
}

/**
 * Crea un PinoLogger con redacción y formato por ambiente. `pretty` y
 * `destination` son mutuamente excluyentes (Pino no admite transport + stream).
 */
export function createPinoLogger(
  opts: CreatePinoLoggerOptions = {},
): PinoLogger {
  const options: pino.LoggerOptions = {
    level: opts.level ?? 'info',
    redact: { paths: SENSITIVE_REDACT_PATHS, censor: '[REDACTED]' },
    ...(opts.pretty && !opts.destination
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  };
  const logger = opts.destination
    ? pino(options, opts.destination)
    : pino(options);
  return new PinoLogger(logger);
}
