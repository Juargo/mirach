import express, { type Express } from 'express';
import request from 'supertest';
import { registrarAuthPublic, registrarAuthMe, type AuthPublicDeps } from './auth.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import type { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';

/**
 * Port de los endpoints de AuthController. Handlers aislados (sin la cadena de
 * auth real): login/logout/demo con dobles de use cases + rate limiters; `me`
 * con un pre-middleware que simula el `req.userId` del session middleware.
 */
const EXPIRA = new Date('2026-08-01T00:00:00.000Z');

function deps(over: Partial<AuthPublicDeps> = {}): AuthPublicDeps {
  return {
    login: { execute: vi.fn().mockResolvedValue(Result.ok({ token: 'tok', userId: 'u1', expiresAt: EXPIRA })) },
    logout: { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) },
    crearDemo: { execute: vi.fn().mockResolvedValue({ token: 'demo-tok', expiresAt: EXPIRA }) },
    demoCleanup: { borrarExpirados: vi.fn().mockResolvedValue(undefined) },
    validarSesion: { execute: vi.fn().mockResolvedValue(Result.fail(new Error('sin sesión'))) },
    loginRateLimiter: { isBlocked: vi.fn().mockReturnValue(false), recordFailure: vi.fn(), reset: vi.fn() },
    demoRateLimiter: { isBlocked: vi.fn().mockReturnValue(false), recordFailure: vi.fn() },
    ...over,
  } as unknown as AuthPublicDeps;
}

function publicApp(d: AuthPublicDeps): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registrarAuthPublic(router, d);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarAuthPublic', () => {
  describe('POST /api/auth/login', () => {
    it('200 con cookie + body; llama al use case con email/password', async () => {
      const d = deps();
      const res = await request(publicApp(d))
        .post('/api/auth/login')
        .send({ email: 'a@b.cl', password: 'secreta' });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body).toEqual({ token: 'tok', userId: 'u1', expiresAt: EXPIRA.toISOString() });
      expect(d.login.execute).toHaveBeenCalledWith({ emailRaw: 'a@b.cl', password: 'secreta' });
      expect(d.loginRateLimiter.reset).toHaveBeenCalled();
    });

    it('429 si el rate limiter bloquea (no llama al use case)', async () => {
      const d = deps({
        loginRateLimiter: { isBlocked: vi.fn().mockReturnValue(true), recordFailure: vi.fn(), reset: vi.fn() } as never,
      });
      const res = await request(publicApp(d)).post('/api/auth/login').send({ email: 'a@b.cl', password: 'x' });

      expect(res.status).toBe(429);
      expect(d.login.execute).not.toHaveBeenCalled();
    });

    it('401 con credenciales inválidas', async () => {
      const d = deps({
        login: { execute: vi.fn().mockResolvedValue(Result.fail(new Error('Credenciales inválidas'))) } as never,
      });
      const res = await request(publicApp(d)).post('/api/auth/login').send({ email: 'a@b.cl', password: 'mala' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('204 y limpia la cookie', async () => {
      const res = await request(publicApp(deps())).post('/api/auth/logout');
      expect(res.status).toBe(204);
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('GET /api/auth/demo', () => {
    it('403 si no es navegación top-level (Sec-Fetch-Dest: image)', async () => {
      const res = await request(publicApp(deps())).get('/api/auth/demo').set('Sec-Fetch-Dest', 'image');
      expect(res.status).toBe(403);
    });

    it('302 a / y setea cookie en el alta demo exitosa', async () => {
      const d = deps();
      const res = await request(publicApp(d)).get('/api/auth/demo');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(d.crearDemo.execute).toHaveBeenCalled();
    });

    it('429 si el rate limiter de demo bloquea', async () => {
      const d = deps({
        demoRateLimiter: { isBlocked: vi.fn().mockReturnValue(true), recordFailure: vi.fn() } as never,
      });
      const res = await request(publicApp(d)).get('/api/auth/demo');
      expect(res.status).toBe(429);
    });
  });
});

describe('registrarAuthMe — GET /api/auth/me', () => {
  function meApp(uc: Pick<ObtenerIdentidadUseCase, 'execute'>): Express {
    const app = express();
    const router = express.Router();
    router.use((req, _res, next) => {
      req.userId = 'user-x';
      next();
    });
    registrarAuthMe(router, uc as ObtenerIdentidadUseCase);
    app.use('/api', router);
    app.use(errorMiddleware);
    return app;
  }

  it('200 con la identidad del usuario autenticado', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-x', email: 'a@b.cl', esDemo: false })),
    };
    const res = await request(meApp(uc)).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-x', email: 'a@b.cl', esDemo: false });
    expect(uc.execute).toHaveBeenCalledWith({ userId: 'user-x' });
  });
});
