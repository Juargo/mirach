import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import type { RequestHandler } from 'express';
import type pino from 'pino';

/**
 * createRequestLoggerMiddleware — una línea NDJSON por request (ADR-033
 * slice 2): método, path, status y latencia, con un correlation id
 * (`X-Request-Id`, tomado del request entrante si lo trae o generado con
 * `randomUUID()` si no) en cada línea vía `genReqId`.
 *
 * Recibe la MISMA instancia `pino.Logger` que usa el resto de la app
 * (`container.logger.raw`, ver container.ts) — no crea una segunda con
 * configuración propia: la redacción de ADR-013 (montos, PII, y los headers
 * `authorization`/`cookie` que ya cubre `SENSITIVE_REDACT_PATHS`, ver
 * pino-logger.ts) aplica igual a estas líneas de request.
 */
export function createRequestLoggerMiddleware(
  logger: pino.Logger,
): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      if (typeof existing === 'string' && existing.length > 0) {
        return existing;
      }
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
  });
}
