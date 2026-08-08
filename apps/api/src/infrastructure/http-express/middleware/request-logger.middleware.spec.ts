import express, { type Express } from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createPinoLogger } from '../../logging/pino-logger';
import { createRequestLoggerMiddleware } from './request-logger.middleware';

/** Logger que captura cada línea NDJSON emitida, para inspeccionar la salida. */
function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const pinoLogger = createPinoLogger({ level: 'info', destination });
  return { raw: pinoLogger.raw, output: () => lines.join('') };
}

function probeApp(raw: ReturnType<typeof captureLogger>['raw']): Express {
  const app = express();
  app.use(createRequestLoggerMiddleware(raw));
  app.get('/probe', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      'md_session=super-secret-token; HttpOnly; Path=/',
    );
    res.status(200).send('ok');
  });
  return app;
}

describe('createRequestLoggerMiddleware — redacción de headers de respuesta (ADR-013)', () => {
  it('redacta Set-Cookie de la respuesta: el token de sesión nunca llega a stdout', async () => {
    const { raw, output } = captureLogger();

    await request(probeApp(raw)).get('/probe');

    expect(output()).toContain('[REDACTED]');
    expect(output()).not.toContain('super-secret-token');
  });
});
