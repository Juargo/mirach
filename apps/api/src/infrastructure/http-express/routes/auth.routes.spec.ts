import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';
import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarAuthPublic,
  registrarAuthMe,
  type AuthPublicDeps,
} from './auth.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import type { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';

/**
 * Port de los endpoints de AuthController. Handlers aislados (sin la cadena de
 * auth real): login/logout con dobles de use cases + rate limiter; `me`
 * con un pre-middleware que simula el `req.userId` del session middleware.
 */
const EXPIRA = new Date('2026-08-01T00:00:00.000Z');

function deps(over: Partial<AuthPublicDeps> = {}): AuthPublicDeps {
  return {
    login: {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ token: 'tok', userId: 'u1', expiresAt: EXPIRA }),
        ),
    },
    logout: { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) },
    loginRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    cookieSecure: false,
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
      expect(res.body).toEqual({
        token: 'tok',
        userId: 'u1',
        expiresAt: EXPIRA.toISOString(),
      });
      expect(d.login.execute).toHaveBeenCalledWith({
        emailRaw: 'a@b.cl',
        password: 'secreta',
      });
      expect(d.loginRateLimiter.reset).toHaveBeenCalled();
    });

    it('cookie con Secure cuando cookieSecure=true (ADR-029, deriva de env)', async () => {
      const d = deps({ cookieSecure: true });
      const res = await request(publicApp(d))
        .post('/api/auth/login')
        .send({ email: 'a@b.cl', password: 'secreta' });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toContain('Secure');
    });

    it('cookie sin Secure cuando cookieSecure=false', async () => {
      const d = deps({ cookieSecure: false });
      const res = await request(publicApp(d))
        .post('/api/auth/login')
        .send({ email: 'a@b.cl', password: 'secreta' });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).not.toContain('Secure');
    });

    it('429 si el rate limiter bloquea (no llama al use case)', async () => {
      const d = deps({
        loginRateLimiter: {
          isBlocked: vi.fn().mockReturnValue(true),
          recordFailure: vi.fn(),
          reset: vi.fn(),
        } as never,
      });
      const res = await request(publicApp(d))
        .post('/api/auth/login')
        .send({ email: 'a@b.cl', password: 'x' });

      expect(res.status).toBe(429);
      expect(d.login.execute).not.toHaveBeenCalled();
    });

    it('401 con credenciales inválidas', async () => {
      const d = deps({
        login: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new Error('Credenciales inválidas')),
            ),
        } as never,
      });
      const res = await request(publicApp(d))
        .post('/api/auth/login')
        .send({ email: 'a@b.cl', password: 'mala' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        message: 'Credenciales inválidas',
        code: 'CREDENCIALES_INVALIDAS',
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('204 y limpia la cookie', async () => {
      const res = await request(publicApp(deps())).post('/api/auth/logout');
      expect(res.status).toBe(204);
      expect(res.headers['set-cookie']).toBeDefined();
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

  it('401 SESION_INVALIDA cuando el use case no resuelve la identidad', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new SesionInvalidaError())),
    };
    const res = await request(meApp(uc)).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Sesión inválida o expirada.',
      code: 'SESION_INVALIDA',
    });
  });

  it('200 con la identidad del usuario autenticado, incluyendo nombre (US-040/AUTH-09)', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-x',
          nombre: 'Jorge',
          email: 'a@b.cl',
          googleVinculado: false,
        }),
      ),
    };
    const res = await request(meApp(uc)).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-x',
      nombre: 'Jorge',
      email: 'a@b.cl',
      googleVinculado: false,
    });
    expect(uc.execute).toHaveBeenCalledWith({ userId: 'user-x' });
  });

  it('200 con googleVinculado: true cuando la identidad tiene Google vinculado (VINC041-08)', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-x',
          nombre: 'Jorge',
          email: 'a@b.cl',
          googleVinculado: true,
        }),
      ),
    };
    const res = await request(meApp(uc)).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.googleVinculado).toBe(true);
  });
});
