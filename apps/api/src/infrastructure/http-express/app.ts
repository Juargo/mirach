import express, { type Express } from 'express';
import type { Container } from '../../composition/container';
import { errorMiddleware } from './middleware/error.middleware';
import { apiKeyMiddleware } from './middleware/api-key.middleware';
import { sessionMiddleware } from './middleware/session.middleware';
import { registrarResumen } from './routes/resumen.routes';
import { registrarBuckets } from './routes/buckets.routes';
import { registrarMovimientos } from './routes/movimientos.routes';
import { registrarTransacciones } from './routes/transacciones.routes';
import { registrarIngestas } from './routes/ingesta.routes';
import { registrarAuthPublic, registrarAuthMe } from './routes/auth.routes';

/**
 * createApp — ensambla la app Express SIN escuchar en un puerto (ADR-028).
 *
 * Separar el armado del `listen()` permite que los tests la ejerzan con
 * supertest de forma hermética. El bootstrap (server.ts) es quien escucha.
 *
 * Estructura de auth/rutas:
 *   1. express.json()
 *   2. health `GET /` público (fuera de /api → sin auth)
 *   3. `apiKeyMiddleware` para TODO `/api` (fail-closed).
 *   4. router session-public (`/auth/login|logout|demo`): api-key SÍ, sesión NO
 *      — el equivalente Express de `@PublicSession()`. Va ANTES del protegido
 *      para que el session middleware no lo intercepte.
 *   5. router protegido (`sessionMiddleware` → routers de datos + `/auth/me`).
 *   6. errorMiddleware (SIEMPRE último, 4 args).
 */
export function createApp(container: Container): Express {
  const app = express();

  app.use(express.json());

  // Health público — sin API key. Lo usa Render. Preserva el contrato actual.
  app.get('/', (_req, res) => {
    res.status(200).send('Hello World!');
  });

  // API key para todo /api (health, en '/', queda fuera).
  app.use('/api', apiKeyMiddleware);

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
  });
  app.use('/api', authPublicApi);

  // Rutas protegidas: exigen sesión válida (además de la api-key global).
  const protectedApi = express.Router();
  protectedApi.use(sessionMiddleware(container.validarSesion));
  registrarResumen(protectedApi, container.calcularResumenMes, container.calcularResumenAnual);
  registrarBuckets(protectedApi, container.obtenerDetalleBucket);
  registrarMovimientos(protectedApi, container.obtenerMovimientosMes);
  registrarTransacciones(protectedApi, container.reclasificarTransaccion);
  registrarIngestas(protectedApi, container.processIngesta);
  registrarAuthMe(protectedApi, container.obtenerIdentidad);
  app.use('/api', protectedApi);

  app.use(errorMiddleware);

  return app;
}
