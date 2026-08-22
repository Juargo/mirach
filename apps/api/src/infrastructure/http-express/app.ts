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
import {
  registrarBuckets,
  registrarBucketDetalleMes,
} from './routes/buckets.routes';
import { registrarIngresosMes } from './routes/ingresos.routes';
import {
  registrarMovimientos,
  registrarMovimientoManual,
} from './routes/movimientos.routes';
import { registrarTransacciones } from './routes/transacciones.routes';
import { registrarIngestas } from './routes/ingesta.routes';
import { registrarAuthPublic, registrarAuthMe } from './routes/auth.routes';
import {
  registrarAuthGoogle,
  registrarAuthGoogleDeshabilitado,
} from './routes/auth-google.routes';
import {
  registrarAuthGoogleToken,
  registrarAuthGoogleTokenDeshabilitado,
} from './routes/auth-google-token.routes';
import { registrarAuthCapabilities } from './routes/auth-capabilities.routes';
import { registrarVersion } from './routes/version.routes';
import { registrarCategorias } from './routes/categorias.routes';
import { registrarPatrones } from './routes/patrones.routes';
import { registrarPerfil } from './routes/perfil.routes';
import {
  registrarPerfilGoogleVincular,
  registrarPerfilGoogleVincularDeshabilitado,
  registrarPerfilGoogleDesvincular,
} from './routes/perfil-google.routes';

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

  // Trust proxy (1 hop) — MoneyDiary's API sits behind exactly one reverse
  // proxy (Render: api.moneydiary.cl CNAME → Render, sin Cloudflare/multi-
  // proxy delante — ver CLAUDE.md). Sin esto, Express ignora
  // `X-Forwarded-For` y `request.ip` resuelve a la IP del proxy, no del
  // cliente real — rompiendo TODOS los rate limiters por IP (`login:ip:`,
  // el demo limiter, `google:ip:`), que colapsan hacia un bucket compartido.
  // Debe ir temprano, antes de cualquier middleware que lea `req.ip`.
  app.set('trust proxy', 1);

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
  // Capability discovery (AC-10, design §8/D7) — ALWAYS mounted regardless
  // of activation state, a diferencia de las rutas de Google mismas. Reporta
  // dos flags independientes (web + mobile, AUTH-16/AUTH-22).
  registrarAuthCapabilities(authPublicApi, {
    googleAuth: container.googleAuth,
    googleAuthMobile: container.googleAuthMobile,
  });
  app.use('/api', authPublicApi);

  // Login con Google (AUTH-16, design §4.4): SIEMPRE se monta un router acá
  // — nunca "no montar nada". Un `/api/auth/google` sin ningún router
  // montado cae en `protectedApi` de abajo, que monta `sessionMiddleware`
  // sin path (`router.use(mw)` corre para TODA request llegada al router) y
  // respondería 401, no el 404 que exige AUTH-16.
  //
  // Slice C2 (este slice): la rama real. `container.googleAuth !== undefined`
  // es el ÚNICO seam de activación — el tipo del campo, no un flag booleano
  // separado (design §4.3). `env.GOOGLE_REDIRECT_URI` se pasa acá, no
  // derivado de la request (design §7).
  const authGoogleApi = express.Router();
  if (container.googleAuth !== undefined) {
    registrarAuthGoogle(authGoogleApi, {
      ...container.googleAuth,
      cookieSecure,
      // `!` is safe here: env.ts guarantees GOOGLE_REDIRECT_URI is present
      // whenever GOOGLE_CLIENT_ID/SECRET are set (required in production,
      // defaulted to localhost in development/test — see
      // `withGoogleRedirectUriDefault`/`refineGoogleAuthEnv` in config/env.ts).
      redirectUri: env.GOOGLE_REDIRECT_URI!,
    });
  } else {
    registrarAuthGoogleDeshabilitado(authGoogleApi);
  }
  app.use('/api', authGoogleApi);

  // Login con Google mobile nativo (AUTH-19..24, ADR-035 M1, design §6.1):
  // router SEPARADO de authGoogleApi (no una rama adentro) — los dos gates
  // son independientes por decisión Q2 (AUTH-22): web puede estar prendido
  // con mobile apagado, y viceversa. `container.googleAuthMobile !==
  // undefined` es el ÚNICO seam de activación, mismo patrón que arriba.
  const authGoogleTokenApi = express.Router();
  if (container.googleAuthMobile !== undefined) {
    registrarAuthGoogleToken(authGoogleTokenApi, container.googleAuthMobile);
  } else {
    registrarAuthGoogleTokenDeshabilitado(authGoogleTokenApi);
  }
  app.use('/api', authGoogleTokenApi);

  // Rutas protegidas: exigen sesión válida (además de la api-key global).
  const protectedApi = express.Router();
  protectedApi.use(sessionMiddleware(container.validarSesion));
  registrarResumen(
    protectedApi,
    container.calcularResumenMes,
    container.calcularResumenAnual,
    container.obtenerSemaforoDetalle,
  );
  registrarBuckets(protectedApi, container.obtenerDetalleBucket);
  registrarBucketDetalleMes(protectedApi, container.obtenerDetalleBucketMes);
  registrarIngresosMes(protectedApi, container.obtenerIngresosMes);
  registrarMovimientos(protectedApi, container.obtenerMovimientosMes);
  registrarMovimientoManual(protectedApi, container.registrarMovimientoManual);
  registrarTransacciones(protectedApi, container.reclasificarTransaccion);
  registrarIngestas(protectedApi, {
    processIngesta: container.processIngesta,
    eliminarIngesta: container.eliminarIngesta,
    listarIngestas: container.listarIngestas,
    previewIngesta: container.previewIngesta,
    commitIngesta: container.commitIngesta,
  });
  registrarAuthMe(protectedApi, container.obtenerIdentidad);
  registrarCategorias(protectedApi, container.catalogo);
  registrarPatrones(protectedApi, container.catalogo);
  registrarPerfil(protectedApi, container.perfil);
  // Vinculación explícita de Google (US-041, design §1/Q2b, binding item
  // #4): MISMO gate `container.googleAuth !== undefined` que
  // `registrarAuthGoogle`/`registrarAuthGoogleDeshabilitado` arriba —
  // montar la ruta real sin condición produciría un `TypeError` → `500` en
  // cualquier entorno sin `GOOGLE_CLIENT_ID` (incluyendo el propio entorno
  // de test de la API). El unlink (PR #3) se monta SIEMPRE, sin este gate.
  if (container.googleAuth !== undefined) {
    registrarPerfilGoogleVincular(protectedApi, {
      iniciarVinculacion: container.googleAuth.iniciarVinculacion,
      linkIntentKey: container.googleAuth.linkIntentKey,
      cookieSecure,
    });
  } else {
    registrarPerfilGoogleVincularDeshabilitado(protectedApi);
  }
  // Desvinculación (PR #3, task 3.9, design §1/Q2b): montada SIEMPRE, sin
  // el gate de arriba — limpiar googleSub no necesita cliente OIDC.
  registrarPerfilGoogleDesvincular(protectedApi, container.perfil);
  app.use('/api', protectedApi);

  app.use(errorMiddleware);

  return app;
}
