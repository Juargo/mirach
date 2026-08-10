import { ILogger, LogContext } from '../../src/application/ports/logger.port';

/**
 * NoOpLogger — doble silencioso de `ILogger` para specs que reciben el port
 * por DI (mismo patrón que `process-ingesta.use-case.ts`) pero no ejercitan
 * ni aseveran sobre logging. Preferir esta sobre `FakeLogger` cuando el spec
 * no necesita inspeccionar las llamadas — evita ruido de un array de
 * `calls` que nadie lee.
 */
export class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * FakeLogger — doble en memoria de `ILogger` que graba cada llamada, para
 * specs que SÍ necesitan aseverar sobre qué se logueó (nivel, mensaje,
 * contexto) — p. ej. la cobertura de redacción de
 * `login-con-google.use-case.spec.ts`.
 *
 * Extraído de `process-ingesta.use-case.spec.ts` (dedupe post-review, mismo
 * criterio que `identidad-google-repository.double.ts`) — nunca pull Pino a
 * un unit test (ADR-033 slice 2/A).
 */
export class FakeLogger implements ILogger {
  readonly calls: Array<{
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context?: LogContext;
  }> = [];

  debug(message: string, context?: LogContext): void {
    this.calls.push({ level: 'debug', message, context });
  }
  info(message: string, context?: LogContext): void {
    this.calls.push({ level: 'info', message, context });
  }
  warn(message: string, context?: LogContext): void {
    this.calls.push({ level: 'warn', message, context });
  }
  error(message: string, context?: LogContext): void {
    this.calls.push({ level: 'error', message, context });
  }
}
