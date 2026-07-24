import request from 'supertest';
import { createApp } from './app';
import { Result } from '../../shared/result';
import type { Container } from '../../composition/container';

/**
 * Gate arquitectónico de Slice 7: el montaje session-public vs protegido.
 *   - login (session-public): exige api-key, NO sesión.
 *   - me (protegido): exige api-key Y sesión.
 * Más el aislamiento: el userId del `me` sale de la sesión.
 */
const EXPIRA = new Date('2026-08-01T00:00:00.000Z');

function fakeContainer(): Container {
  const stub = { execute: vi.fn() };
  return {
    validarSesion: { execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion' })) },
    calcularResumenMes: stub,
    calcularResumenAnual: stub,
    obtenerDetalleBucket: stub,
    obtenerMovimientosMes: stub,
    reclasificarTransaccion: stub,
    processIngesta: stub,
    login: { execute: vi.fn().mockResolvedValue(Result.ok({ token: 'tok', userId: 'u1', expiresAt: EXPIRA })) },
    logout: { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) },
    obtenerIdentidad: {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-de-sesion', email: 'a@b.cl', esDemo: false })),
    },
    crearDemo: { execute: vi.fn().mockResolvedValue({ token: 'd', expiresAt: EXPIRA }) },
    loginRateLimiter: { isBlocked: vi.fn().mockReturnValue(false), recordFailure: vi.fn(), reset: vi.fn() },
    demoRateLimiter: { isBlocked: vi.fn().mockReturnValue(false), recordFailure: vi.fn() },
    demoCleanup: { borrarExpirados: vi.fn().mockResolvedValue(undefined) },
    shutdown: async () => {},
  } as unknown as Container;
}

describe('/api/auth — session-public vs protegido', () => {
  const KEY = 'k'.repeat(64);
  const original = process.env.API_KEY;

  beforeEach(() => {
    process.env.API_KEY = KEY;
  });
  afterEach(() => {
    process.env.API_KEY = original;
  });

  it('POST /api/auth/login: 401 sin x-api-key (api-key global)', async () => {
    const res = await request(createApp(fakeContainer()))
      .post('/api/auth/login')
      .send({ email: 'a@b.cl', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login: 200 con api-key SIN sesión (session-public)', async () => {
    const res = await request(createApp(fakeContainer()))
      .post('/api/auth/login')
      .set('x-api-key', KEY)
      .send({ email: 'a@b.cl', password: 'secreta' });
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/me: 401 con api-key pero SIN sesión (protegido)', async () => {
    const res = await request(createApp(fakeContainer())).get('/api/auth/me').set('x-api-key', KEY);
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me: 200 con api-key + sesión; el userId sale de la sesión', async () => {
    const c = fakeContainer();
    const res = await request(createApp(c))
      .get('/api/auth/me')
      .set('x-api-key', KEY)
      .set('Authorization', 'Bearer token-valido');

    expect(res.status).toBe(200);
    expect(c.obtenerIdentidad.execute).toHaveBeenCalledWith({ userId: 'user-de-sesion' });
  });
});
