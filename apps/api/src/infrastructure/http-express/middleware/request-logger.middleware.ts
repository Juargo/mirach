import { randomUUID } from 'node:crypto';
import pinoHttp, { type StdSerializers } from 'pino-http';
import type { RequestHandler } from 'express';
import type pino from 'pino';
import {
  redactSensitiveQueryParams,
  redactSensitiveQueryObject,
} from './redact-sensitive-query-params';
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  appClientLogProps,
} from './app-client-headers';

/**
 * Shape que `pino-http` le pasa a un `serializers.req` custom — NO el
 * `IncomingMessage` crudo, sino el resultado YA CORRIDO por el serializer
 * default de `pino-std-serializers` (`wrapRequestSerializer`, verificado en
 * la fuente instalada: el custom serializer envuelve al default, nunca lo
 * reemplaza). Derivado del propio tipo de `pino-http` (`StdSerializers`)
 * en vez de importar `pino-std-serializers` como dependencia directa
 * nueva — es transitiva de `pino-http`, y este repo (ADR-029/pnpm aislado)
 * exige declarar solo lo que se importa como VALOR, no solo como tipo
 * derivado.
 */
type SerializedRequest = ReturnType<StdSerializers['req']>;

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
 *
 * Serializer `req` custom (design §6.3(a), AUTH-18): el default de
 * `pino-http` (`pino-std-serializers`) emite `url` con el query string
 * COMPLETO y, ADEMÁS, un campo `query` separado con el objeto ya parseado
 * por Express — dos vectores independientes por los que `?code=...&state=...`
 * del callback de Google llegarían en crudo a los logs de producción
 * (verificado empíricamente el shape real emitido, no solo asumido del
 * design). `SENSITIVE_REDACT_PATHS` (pino-logger.ts) no alcanza ninguno de
 * los dos: el primero es un string opaco sin claves direccionables, y el
 * segundo tiene claves dinámicas por request. Se envuelve el serializer
 * estándar de `pino-http` y se redactan ambos campos ANTES de que la línea
 * salga.
 *
 * `X-App-Version`/`X-App-Platform` (#116, ADR-011): se loguean como
 * `appVersion`/`appPlatform` SOLO validados (`appClientLogProps`), y sus
 * headers crudos se quitan de `req.headers` — así un valor arbitrario nunca
 * llega a la línea.
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
    customProps: (req) => ({ ...appClientLogProps(req.headers) }),
    serializers: {
      req: (req: SerializedRequest) => ({
        ...req,
        headers: withoutAppClientHeaders(req.headers),
        url: redactSensitiveQueryParams(req.url),
        query:
          req.query !== undefined && typeof req.query === 'object'
            ? redactSensitiveQueryObject(req.query)
            : req.query,
      }),
    },
  });
}

function withoutAppClientHeaders(
  headers: SerializedRequest['headers'],
): SerializedRequest['headers'] {
  if (headers === undefined || headers === null) return headers;
  const {
    [APP_VERSION_HEADER]: _version,
    [APP_PLATFORM_HEADER]: _platform,
    ...rest
  } = headers;
  return rest;
}
