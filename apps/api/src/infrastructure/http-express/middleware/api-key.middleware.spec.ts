import express, { type Express } from 'express';
import request from 'supertest';
import { apiKeyMiddleware } from './api-key.middleware';

/**
 * Verificación de control de acceso (ADR-015 — énfasis en acceso). Port 1:1 del
 * `ApiKeyGuard` a middleware Express: mismos caminos, mismos status codes.
 * El middleware es la única barrera que impide exponer datos financieros al
 * desplegar, así que se cubren todos sus caminos.
 */
function probeApp(): Express {
  const app = express();
  app.use(apiKeyMiddleware);
  app.get('/probe', (_req, res) => res.status(200).send('ok'));
  return app;
}

describe('apiKeyMiddleware', () => {
  const KEY_VALIDA = 'a'.repeat(64);
  const original = process.env.API_KEY;

  afterEach(() => {
    process.env.API_KEY = original;
  });

  it('500 fail-closed si API_KEY no está configurada', async () => {
    delete process.env.API_KEY;
    const res = await request(probeApp()).get('/probe');
    expect(res.status).toBe(500);
  });

  it('500 fail-closed si API_KEY es demasiado corta', async () => {
    process.env.API_KEY = 'corta';
    const res = await request(probeApp()).get('/probe');
    expect(res.status).toBe(500);
  });

  it('401 sin header x-api-key', async () => {
    process.env.API_KEY = KEY_VALIDA;
    const res = await request(probeApp()).get('/probe');
    expect(res.status).toBe(401);
  });

  it('401 con key incorrecta', async () => {
    process.env.API_KEY = KEY_VALIDA;
    const res = await request(probeApp()).get('/probe').set('x-api-key', 'b'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('deja pasar (200) con la key correcta', async () => {
    process.env.API_KEY = KEY_VALIDA;
    const res = await request(probeApp()).get('/probe').set('x-api-key', KEY_VALIDA);
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });
});
