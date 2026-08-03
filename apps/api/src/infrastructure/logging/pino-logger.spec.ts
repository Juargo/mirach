import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createPinoLogger } from './pino-logger';

/** Logger que captura cada línea NDJSON emitida, para inspeccionar la salida. */
function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = createPinoLogger({ level: 'debug', destination });
  return { logger, output: () => lines.join('') };
}

describe('PinoLogger — redacción de datos sensibles (ADR-013)', () => {
  it('redacta montos (cargo/abono): nunca aparecen en crudo', () => {
    const { logger, output } = captureLogger();

    logger.info('ingesta procesada', { cargo: '150000', abono: '0' });

    expect(output()).toContain('[REDACTED]');
    expect(output()).not.toContain('150000');
  });

  it('redacta PII (email, numeroCuenta)', () => {
    const { logger, output } = captureLogger();

    logger.warn('login', { email: 'user@test.cl', numeroCuenta: '1234-5' });

    expect(output()).not.toContain('user@test.cl');
    expect(output()).not.toContain('1234-5');
  });

  it('deja pasar campos no sensibles (path, status)', () => {
    const { logger, output } = captureLogger();

    logger.info('request', { path: '/api/resumen', status: 200 });

    expect(output()).toContain('/api/resumen');
    expect(output()).toContain('200');
  });
});
