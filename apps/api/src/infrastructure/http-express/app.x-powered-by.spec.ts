import request from 'supertest';
import { createApp } from './app';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * createApp — no `X-Powered-By` header.
 *
 * Express emite `X-Powered-By: Express` por defecto en TODA respuesta. No es
 * una vulnerabilidad por sí sola, pero es reconocimiento gratis: le dice a un
 * atacante qué stack atacar antes de que pruebe nada, y con qué CVEs empezar.
 *
 * Lo detectó el DAST de ADR-021 (ZAP, alerta 10037) en 12 rutas escaneadas,
 * una vez que el escaneo volvió a funcionar de verdad.
 *
 * El spec cubre las dos formas de respuesta —una ruta pública que resuelve y
 * una rechazada por el middleware de API key— porque `app.disable()` actúa a
 * nivel de app y debe valer también para las respuestas de error, que es
 * justamente donde un header de más se suele colar.
 */
describe('createApp — X-Powered-By', () => {
  const fakeContainer = {
    shutdown: async () => {},
  } as unknown as Container;

  it('no expone X-Powered-By en una respuesta exitosa', async () => {
    const app = createApp(fakeContainer, buildTestEnv());

    const res = await request(app).get('/version');

    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('tampoco lo expone en una respuesta de error del middleware', async () => {
    const app = createApp(fakeContainer, buildTestEnv());

    // Sin `x-api-key`: la corta `apiKeyMiddleware` antes de cualquier ruta.
    const res = await request(app).get('/api/resumen');

    expect(res.status).toBe(401);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
