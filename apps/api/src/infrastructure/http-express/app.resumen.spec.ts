import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';

/**
 * GATE de Slice 1+2 (ADR-015, RNF-SEC-006): la cadena de auth completa montada
 * en la app real, y la prueba de aislamiento — el `userId` que llega al use case
 * es el DERIVADO DE LA SESIÓN, no una constante fija.
 *
 * Usa un container falso (fakes de validarSesion + use cases): hermético, sin DB.
 * La verificación de que el REPO filtra por ese userId ya vive en los tests de
 * integración del repo (sin cambios). Acá se prueba que el stack Express pasa el
 * userId correcto por la cadena.
 */
const RESUMEN_MES_OK = { totalIngreso: 0n, sinIngreso: true, buckets: [], estadoGlobal: null };

function fakeContainer(): Container {
  return {
    validarSesion: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })),
    },
    calcularResumenMes: {
      execute: vi.fn().mockResolvedValue(Result.ok({ periodo: '2026-07', resumen: RESUMEN_MES_OK })),
    },
    calcularResumenAnual: {
      execute: vi.fn().mockResolvedValue(Result.ok({ resumenAnual: { anio: 2026, meses: [] } })),
    },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('GET /api/resumen — cadena de auth + aislamiento', () => {
  const KEY = 'k'.repeat(64);
  const original = process.env.API_KEY;

  beforeEach(() => {
    process.env.API_KEY = KEY;
  });
  afterEach(() => {
    process.env.API_KEY = original;
  });

  it('401 sin x-api-key (api-key middleware corta primero)', async () => {
    const res = await request(createApp(fakeContainer()))
      .get('/api/resumen')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(401);
  });

  it('401 con api-key pero sin sesión (session middleware)', async () => {
    const res = await request(createApp(fakeContainer())).get('/api/resumen').set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('200 con api-key + sesión; el userId de la SESIÓN fluye al use case (aislamiento)', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c))
      .get('/api/resumen')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    // EL GATE: el use case recibe el userId derivado de la sesión, no uno fijo.
    expect(c.calcularResumenMes.execute).toHaveBeenCalledWith({
      userId: 'user-de-sesion',
      periodo: undefined,
    });
  });

  it('health GET / sigue público (sin api-key ni sesión)', async () => {
    const res = await request(createApp(fakeContainer())).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });
});
