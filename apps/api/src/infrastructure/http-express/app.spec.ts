import request from 'supertest';
import { createApp } from './app';
import type { Container } from '../../composition/container';

/**
 * createApp — arma la app Express sin escuchar en un puerto, para que los tests
 * la ejerzan con supertest de forma hermética (sin puerto vivo, sin DB).
 *
 * Slice 0: solo el health `GET /` público, que preserva el contrato actual
 * (string 'Hello World!', usado por Render). Prueba de que el harness anda.
 */
describe('createApp — health', () => {
  // El health no usa el container; a medida que crece la interfaz, este doble
  // se mantiene mínimo vía cast (unknown) en vez de ensamblar todo el grafo.
  const fakeContainer = {
    shutdown: async () => {},
  } as unknown as Container;

  it('GET / responde 200 con Hello World! (público, sin API key)', async () => {
    const app = createApp(fakeContainer);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });
});
