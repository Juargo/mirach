import express, { type Express } from 'express';
import request from 'supertest';
import { createCorsMiddleware } from './cors.middleware';

/**
 * CORS por allowlist. Verifica que solo los orígenes permitidos reciben el
 * header `Access-Control-Allow-Origin` (nunca `*`) y que el preflight OPTIONS
 * se resuelve 204 sin llegar a la ruta.
 */
const ALLOWED = 'http://localhost:5173';

function probeApp(): Express {
  const app = express();
  app.use(createCorsMiddleware([ALLOWED]));
  app.get('/probe', (_req, res) => res.status(200).send('ok'));
  return app;
}

describe('createCorsMiddleware', () => {
  it('refleja Access-Control-Allow-Origin para un origen permitido', async () => {
    const res = await request(probeApp()).get('/probe').set('Origin', ALLOWED);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['vary']).toContain('Origin');
  });

  it('NO agrega el header para un origen fuera de la allowlist', async () => {
    const res = await request(probeApp())
      .get('/probe')
      .set('Origin', 'https://evil.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('nunca responde con el comodín "*"', async () => {
    const res = await request(probeApp()).get('/probe').set('Origin', ALLOWED);

    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('resuelve el preflight OPTIONS de un origen permitido con 204 + headers', async () => {
    const res = await request(probeApp())
      .options('/probe')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('sin header Origin (request same-origin / server-to-server) no agrega CORS', async () => {
    const res = await request(probeApp()).get('/probe');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
