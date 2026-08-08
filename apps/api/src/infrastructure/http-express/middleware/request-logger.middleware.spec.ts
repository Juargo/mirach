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

/**
 * design §6.3(a), AUTH-18 — el `req` serializer por defecto de `pino-http`
 * emite `url` CON su query string completo, y ADEMÁS (descubierto al
 * verificar empíricamente, no solo asumido del design) un campo `query`
 * separado con el objeto ya parseado por Express — dos vectores
 * independientes por los que `?code=...&state=...` del callback de Google
 * llegarían en crudo a los logs de producción. Este test cubre AMBOS: un
 * shape de URL de callback real, verificando que el valor secreto no
 * aparece en NINGÚN lugar de la línea NDJSON emitida (ni en `url` ni en
 * `query`), mirror del test de redacción de Set-Cookie de arriba.
 */
describe('createRequestLoggerMiddleware — redacción de query params sensibles (design §6.3(a), AUTH-18)', () => {
  function probeCallbackApp(
    raw: ReturnType<typeof captureLogger>['raw'],
  ): Express {
    const app = express();
    app.use(createRequestLoggerMiddleware(raw));
    app.get('/api/auth/google/callback', (_req, res) => {
      res.status(302).redirect('/');
    });
    return app;
  }

  it('una request con forma de callback de Google (?code=...&state=...) nunca emite esos valores en la línea de log', async () => {
    const { raw, output } = captureLogger();

    await request(probeCallbackApp(raw)).get(
      '/api/auth/google/callback?code=SECRET_AUTH_CODE&state=SECRET_STATE_VALUE',
    );

    const linea = output();
    expect(linea).toContain('[REDACTED]');
    expect(linea).not.toContain('SECRET_AUTH_CODE');
    expect(linea).not.toContain('SECRET_STATE_VALUE');
  });

  it('periodo/anio (no sensibles) siguen visibles en el log — la redacción es dirigida, no un blanket-redact', async () => {
    const { raw, output } = captureLogger();
    const app = express();
    app.use(createRequestLoggerMiddleware(raw));
    app.get('/api/resumen', (_req, res) => res.status(200).json({}));

    await request(app).get('/api/resumen?periodo=2026-07&anio=2026');

    const linea = output();
    expect(linea).toContain('2026-07');
  });
});
