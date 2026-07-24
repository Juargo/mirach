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

/**
 * createApp — ensambla la app Express SIN escuchar en un puerto (ADR-028).
 *
 * Separar el armado del `listen()` permite que los tests la ejerzan con
 * supertest de forma hermética. El bootstrap (server.ts) es quien escucha.
 *
 * Orden de middleware:
 *   1. express.json()
 *   2. health `GET /` público (fuera de /api → sin auth)
 *   3. router `/api` protegido: apiKey → session → routers de datos.
 *      "Público" = la ruta no monta el middleware (no hay @Public() en Express).
 *      Las rutas session-public (login/demo) montarán en OTRO router (solo
 *      api-key) en Slice 7.
 *   4. errorMiddleware (SIEMPRE último, 4 args).
 */
export function createApp(container: Container): Express {
  const app = express();

  app.use(express.json());

  // Health público — sin API key. Lo usa Render. Preserva el contrato actual.
  app.get('/', (_req, res) => {
    res.status(200).send('Hello World!');
  });

  // API de datos: toda ruta acá exige api-key + sesión válida.
  const protectedApi = express.Router();
  protectedApi.use(apiKeyMiddleware);
  protectedApi.use(sessionMiddleware(container.validarSesion));
  registrarResumen(protectedApi, container.calcularResumenMes, container.calcularResumenAnual);
  registrarBuckets(protectedApi, container.obtenerDetalleBucket);
  registrarMovimientos(protectedApi, container.obtenerMovimientosMes);
  registrarTransacciones(protectedApi, container.reclasificarTransaccion);
  registrarIngestas(protectedApi, container.processIngesta);
  app.use('/api', protectedApi);

  app.use(errorMiddleware);

  return app;
}
