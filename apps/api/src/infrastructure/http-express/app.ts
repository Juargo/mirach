import express, { type Express } from 'express';
import type { Container } from '../../composition/container';
import type { Env } from '../../config/env';
import { errorMiddleware } from './middleware/error.middleware';
import { createApiKeyMiddleware } from './middleware/api-key.middleware';
import { createCorsMiddleware } from './middleware/cors.middleware';
import { createRequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { sessionMiddleware } from './middleware/session.middleware';
import { createPinoLogger } from '../logging/pino-logger';
import { registrarResumen } from './routes/resumen.routes';
import { registrarBuckets } from './routes/buckets.routes';
import { registrarMovimientos } from './routes/movimientos.routes';
import { registrarTransacciones } from './routes/transacciones.routes';
import { registrarIngestas } from './routes/ingesta.routes';
import { registrarAuthPublic, registrarAuthMe } from './routes/auth.routes';
import { registrarAuthGoogleDeshabilitado } from './routes/auth-google.routes';
import { registrarVersion } from './routes/version.routes';

/**
 * createApp — ensambla la app Express SIN escuchar en un puerto (ADR-028/029).
 *
 * Separar el armado del `listen()` permite que los tests la ejerzan con
 * supertest de forma hermética. El bootstrap (server.ts) es quien escucha.
 *
 * ADR-029: recibe `env` inyectado (ya validado por `loadEnv()` en server.ts).
 * `createApiKeyMiddleware(env.API_KEY)` se llama UNA VEZ acá — no hay más
 * lectura de `process.env.API_KEY` por request. `cookieSecure` se deriva acá
 * también, una única vez, y fluye a `registrarAuthPublic` vía `AuthPublicDeps`.
 *
 * Estructura de auth/rutas:
 *   1. express.json()
 *   2. health `GET /` público (fuera de /api → sin auth)
 *   3. `createApiKeyMiddleware(env.API_KEY)` para TODO `/api` (fail-closed).
 *   4. router session-public (`/auth/login|logout|demo`): api-key SÍ, sesión NO
 *      — el equivalente Express de `@PublicSession()`. Va ANTES del protegido
 *      para que el session middleware no lo intercepte.
 *   5. router protegido (`sessionMiddleware` → routers de datos + `/auth/me`).
 *   6. errorMiddleware (SIEMPRE último, 4 args).
 */
export function createApp(container: Container, env: Env): Express {
  const app = express();

  // CORS por allowlist (ADR-029) — global y ANTES de la api-key: el preflight
  // OPTIONS del navegador viaja sin credenciales y debe resolverse acá, no
  // chocar con el 401 de la api-key. Habilita el `GET /version` cross-origin
  // que consume el web; el resto de `/api/*` sigue yendo por el proxy
  // same-origin (sin header Origin → este middleware no agrega nada).
  app.use(createCorsMiddleware(env.CORS_ALLOWED_ORIGINS));

  // Request logging (ADR-033 slice 2) — una línea NDJSON por request, ANTES
  // de cualquier middleware de negocio para que capture incluso 400s de
  // parseo/validación tempranos. Instancia propia (no `container.logger`,
  // ver Container docstring) para que `createApp` siga siendo ejercitable
  // con un `Container` doble mínimo en tests — misma redacción (ADR-013,
  // `SENSITIVE_REDACT_PATHS`) que el resto de la app vía `createPinoLogger`.
  const requestLogger = createPinoLogger({
    pretty: env.NODE_ENV === 'development',
  });
  app.use(createRequestLoggerMiddleware(requestLogger.raw));

  app.use(express.json());

  // Health público — sin API key. Lo usa Render. Preserva el contrato actual.
  app.get('/', (_req, res) => {
    res.status(200).send('Hello World!');
  });

  // Versión del build desplegado — público (fuera de /api), sin API key.
  registrarVersion(app);

  // API key para todo /api (health, en '/', queda fuera).
  app.use('/api', createApiKeyMiddleware(env.API_KEY));

  // Secure de la cookie de sesión (ADR-029, mirrors la extinta shouldBeSecure()):
  // producción SIEMPRE segura; fuera de prod, sigue el flag explícito de env.
  const cookieSecure = env.NODE_ENV === 'production' || env.COOKIE_SECURE;

  // Rutas session-public: api-key ya aplicado, sin sesión.
  const authPublicApi = express.Router();
  registrarAuthPublic(authPublicApi, {
    login: container.login,
    logout: container.logout,
    crearDemo: container.crearDemo,
    demoCleanup: container.demoCleanup,
    validarSesion: container.validarSesion,
    loginRateLimiter: container.loginRateLimiter,
    demoRateLimiter: container.demoRateLimiter,
    cookieSecure,
  });
  app.use('/api', authPublicApi);

  // Login con Google (AUTH-16, design §4.4): SIEMPRE se monta un router acá
  // — nunca "no montar nada". Un `/api/auth/google` sin ningún router
  // montado cae en `protectedApi` de abajo, que monta `sessionMiddleware`
  // sin path (`router.use(mw)` corre para TODA request llegada al router) y
  // respondería 401, no el 404 que exige AUTH-16.
  //
  // Slice C1 (este slice): SIEMPRE el stub deshabilitado — los handlers
  // reales (`registrarAuthGoogle`) no existen todavía, así que no hay rama
  // que tomar sobre `container.googleAuth` acá (la activación SÍ se refleja
  // ya en `GET /api/auth/capabilities`, que lee `container.googleAuth`
  // directamente). Slice C2 reemplaza esto por
  // `container.googleAuth !== undefined ? registrarAuthGoogle(...) :
  // registrarAuthGoogleDeshabilitado(...)`.
  const authGoogleApi = express.Router();
  registrarAuthGoogleDeshabilitado(authGoogleApi);
  app.use('/api', authGoogleApi);

  // Rutas protegidas: exigen sesión válida (además de la api-key global).
  const protectedApi = express.Router();
  protectedApi.use(sessionMiddleware(container.validarSesion));
  registrarResumen(
    protectedApi,
    container.calcularResumenMes,
    container.calcularResumenAnual,
  );
  registrarBuckets(protectedApi, container.obtenerDetalleBucket);
  registrarMovimientos(protectedApi, container.obtenerMovimientosMes);
  registrarTransacciones(protectedApi, container.reclasificarTransaccion);
  registrarIngestas(protectedApi, {
    processIngesta: container.processIngesta,
    eliminarIngesta: container.eliminarIngesta,
    listarIngestas: container.listarIngestas,
    previewIngesta: container.previewIngesta,
  });
  registrarAuthMe(protectedApi, container.obtenerIdentidad);
  app.use('/api', protectedApi);

  app.use(errorMiddleware);

  return app;
}
