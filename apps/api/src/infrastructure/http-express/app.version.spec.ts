import request from 'supertest';
import { createApp } from './app';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * GET /version — endpoint público que expone el build desplegado (ADR-030).
 *
 * Como el health `GET /`, vive fuera de `/api`: debe responder SIN API key.
 * No toca el container. La versión se lee del package.json real, así que el
 * test valida forma/contrato (no un número fijo que release-please bumpea).
 */
describe('createApp — GET /version', () => {
  const fakeContainer = {
    shutdown: async () => {},
  } as unknown as Container;

  it('responde 200 público (sin API key) con el contrato de build info', async () => {
    const app = createApp(fakeContainer, buildTestEnv());

    const res = await request(app).get('/version');

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'builtAt',
      'commit',
      'ref',
      'version',
    ]);
    expect(typeof body.version).toBe('string');
    expect(typeof body.commit).toBe('string');
    expect(typeof body.ref).toBe('string');
    expect(typeof body.builtAt).toBe('string');
    expect(body.version).not.toBe('');
  });

  it('permite el fetch cross-origin del web (CORS) desde un origen de la allowlist', async () => {
    // buildTestEnv() trae el default CORS_ALLOWED_ORIGINS = http://localhost:5173,
    // que es exactamente el origen del dev server del web.
    const app = createApp(fakeContainer, buildTestEnv());

    const res = await request(app)
      .get('/version')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });
});
