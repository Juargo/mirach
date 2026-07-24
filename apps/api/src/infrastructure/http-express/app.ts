import express, { type Express } from 'express';
import type { Container } from '../../composition/container';
import { errorMiddleware } from './middleware/error.middleware';

/**
 * createApp — ensambla la app Express SIN escuchar en un puerto (ADR-028).
 *
 * Separar el armado del `listen()` permite que los tests la ejerzan con
 * supertest de forma hermética. El bootstrap (server.ts) es quien escucha.
 *
 * Orden de middleware (Slice 0): json → rutas → error (siempre último). La
 * cadena de auth (api-key → session → sec-fetch) y los routers de cada endpoint
 * se inyectan en las slices siguientes; por eso `container` ya está en la firma
 * aunque el health no lo use todavía.
 */
export function createApp(_container: Container): Express {
  const app = express();

  app.use(express.json());

  // Health público — sin API key. Lo usa Render para verificar liveness.
  // Preserva el contrato actual (string 'Hello World!', ver app.service.ts).
  app.get('/', (_req, res) => {
    res.status(200).send('Hello World!');
  });

  app.use(errorMiddleware);

  return app;
}
