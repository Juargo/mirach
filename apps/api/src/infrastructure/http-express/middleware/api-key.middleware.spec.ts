import express, { type Express } from 'express';
import request from 'supertest';
import { createApiKeyMiddleware } from './api-key.middleware';

/**
 * Verificación de control de acceso (ADR-015 — énfasis en acceso). Port 1:1 del
 * `ApiKeyGuard` a middleware Express: mismos caminos, mismos status codes.
 *
 * ADR-029: `createApiKeyMiddleware` es una FACTORY — se llama una única vez en
 * app.ts con `env.API_KEY` (ya validada por `loadEnv()`, min 16 chars en boot).
 * El chequeo de longitud/ausencia ya NO ocurre por request (movido a env.ts,
 * ver env.spec.ts) — este middleware solo compara en tiempo constante.
 */
function probeApp(apiKey: string): Express {
  const app = express();
  app.use(createApiKeyMiddleware(apiKey));
  app.get('/probe', (_req, res) => res.status(200).send('ok'));
  return app;
}

describe('createApiKeyMiddleware', () => {
  const KEY_VALIDA = 'a'.repeat(64);

  it('lanza en boot si la key es demasiado corta (<16 chars) — guardia defensiva', () => {
    expect(() => createApiKeyMiddleware('corta')).toThrow(/16/);
  });

  it('401 sin header x-api-key', async () => {
    const res = await request(probeApp(KEY_VALIDA)).get('/probe');
    expect(res.status).toBe(401);
  });

  it('401 con key incorrecta', async () => {
    const res = await request(probeApp(KEY_VALIDA)).get('/probe').set('x-api-key', 'b'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('deja pasar (200) con la key correcta', async () => {
    const res = await request(probeApp(KEY_VALIDA)).get('/probe').set('x-api-key', KEY_VALIDA);
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });
});
