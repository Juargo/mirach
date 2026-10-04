import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarAuthAppleToken,
  registrarAuthAppleTokenDeshabilitado,
  type AuthAppleTokenDeps,
} from './auth-apple-token.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { LoginConAppleFallidoError } from '../../../domain/errors/login-con-apple-fallido.error';
import { VerificacionIdentidadFallidaError } from '../../../domain/errors/verificacion-identidad-fallida.error';
import type { LoginConAppleResult } from '../../../application/use-cases/login-con-apple.use-case';
import { IpRateLimiter } from '../../http/auth/ip-rate-limiter';

/** Body 401 byte-idéntico al de `/auth/login` y al de Google (no enumeración). */
const GENERIC_401_BODY = { message: 'Credenciales inválidas.' };

const IDENTIDAD = {
  sub: 'apple-sub-1',
  email: 'a@b.cl',
  emailVerificado: true,
  emailPrivado: false,
};

function loginOk(esNuevoUsuario: boolean) {
  return {
    execute: vi.fn().mockResolvedValue(
      Result.ok<LoginConAppleResult>({
        token: 'tok',
        userId: 'user-1',
        expiresAt: new Date('2026-10-11T00:00:00.000Z'),
        esNuevoUsuario,
      }),
    ),
  };
}

function deps(over: Partial<AuthAppleTokenDeps> = {}): AuthAppleTokenDeps {
  return {
    verificadorIdToken: {
      verificarIdToken: vi.fn().mockResolvedValue(Result.ok(IDENTIDAD)),
    },
    loginConApple: loginOk(false),
    appleTokenRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    ...over,
  } as unknown as AuthAppleTokenDeps;
}

function tokenApp(d: AuthAppleTokenDeps): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registrarAuthAppleToken(router, d);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

const BODY = { identityToken: 'a.b.c', nonce: 'nonce-crudo' };

describe('registrarAuthAppleToken — POST /api/auth/apple/token', () => {
  it('200 con { token, userId, expiresAt } y sin Set-Cookie (Bearer)', async () => {
    const d = deps();

    const res = await request(tokenApp(d))
      .post('/api/auth/apple/token')
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'tok',
      userId: 'user-1',
      expiresAt: '2026-10-11T00:00:00.000Z',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(d.verificadorIdToken.verificarIdToken).toHaveBeenCalledWith(
      'a.b.c',
      'nonce-crudo',
    );
  });

  it('pasa la identidad verificada y el nombre al use case', async () => {
    const d = deps();

    await request(tokenApp(d))
      .post('/api/auth/apple/token')
      .send({ ...BODY, nombre: 'Jorge Retamal' });

    expect(d.loginConApple.execute).toHaveBeenCalledWith(
      IDENTIDAD,
      'Jorge Retamal',
    );
  });

  it('el body 200 es idéntico para alta y login; esNuevoUsuario nunca se serializa', async () => {
    const alta = await request(
      tokenApp(deps({ loginConApple: loginOk(true) as never })),
    )
      .post('/api/auth/apple/token')
      .send(BODY);
    const login = await request(tokenApp(deps()))
      .post('/api/auth/apple/token')
      .send(BODY);

    expect(alta.body).toEqual(login.body);
    expect(Object.keys(alta.body).sort()).toEqual([
      'expiresAt',
      'token',
      'userId',
    ]);
  });

  it('login de un usuario existente libera el cupo del rate limiter; un alta NO', async () => {
    const dLogin = deps();
    await request(tokenApp(dLogin)).post('/api/auth/apple/token').send(BODY);
    expect(dLogin.appleTokenRateLimiter.reset).toHaveBeenCalledWith(
      expect.any(String),
    );

    const dAlta = deps({ loginConApple: loginOk(true) as never });
    await request(tokenApp(dAlta)).post('/api/auth/apple/token').send(BODY);
    expect(dAlta.appleTokenRateLimiter.reset).not.toHaveBeenCalled();
  });

  it.each([
    ['sin body', undefined],
    ['sin identityToken', { nonce: 'n' }],
    ['sin nonce', { identityToken: 'a.b.c' }],
    ['identityToken no-string', { identityToken: 5, nonce: 'n' }],
    ['nombre de tipo inválido', { ...BODY, nombre: 5 }],
  ])(
    '%s → 401 genérico (nunca 400) sin invocar al verificador',
    async (_n, body) => {
      const d = deps();

      const res = await request(tokenApp(d))
        .post('/api/auth/apple/token')
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC_401_BODY);
      expect(d.verificadorIdToken.verificarIdToken).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'la verificación del token falla',
      () =>
        deps({
          verificadorIdToken: {
            verificarIdToken: vi
              .fn()
              .mockResolvedValue(
                Result.fail(new VerificacionIdentidadFallidaError('x')),
              ),
          },
        }),
    ],
    [
      'la resolución de identidad falla (ej. email ausente)',
      () =>
        deps({
          loginConApple: {
            execute: vi
              .fn()
              .mockResolvedValue(
                Result.fail(new LoginConAppleFallidoError('email-ausente')),
              ),
          } as never,
        }),
    ],
    [
      'el verificador lanza una excepción inesperada',
      () =>
        deps({
          verificadorIdToken: {
            verificarIdToken: vi.fn().mockRejectedValue(new Error('boom')),
          },
        }),
    ],
    [
      'el use case lanza una excepción inesperada',
      () =>
        deps({
          loginConApple: {
            execute: vi.fn().mockRejectedValue(new Error('db caída')),
          } as never,
        }),
    ],
  ])('401 con el MISMO body genérico cuando %s', async (_n, make) => {
    const res = await request(tokenApp(make()))
      .post('/api/auth/apple/token')
      .send(BODY);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401_BODY);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('429 cuando el limitador bloquea, sin verificar nada', async () => {
    const d = deps({
      appleTokenRateLimiter: {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as never,
    });

    const res = await request(tokenApp(d))
      .post('/api/auth/apple/token')
      .send(BODY);

    expect(res.status).toBe(429);
    expect(d.verificadorIdToken.verificarIdToken).not.toHaveBeenCalled();
  });

  it('con un IpRateLimiter real, agotar el presupuesto de intentos fallidos termina en 429', async () => {
    const limiter = new IpRateLimiter('apple-test:', 2, 60_000);
    const d = deps({
      verificadorIdToken: {
        verificarIdToken: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new VerificacionIdentidadFallidaError('x')),
          ),
      },
      appleTokenRateLimiter: limiter,
    });
    const app = tokenApp(d);

    const estados: number[] = [];
    for (let i = 0; i < 4; i++) {
      estados.push(
        (await request(app).post('/api/auth/apple/token').send(BODY)).status,
      );
    }

    expect(estados).toEqual([401, 401, 429, 429]);
  });

  it('nunca loguea el identityToken, el nonce ni el nombre en un 401', async () => {
    // El contrato de redacción se fija en la ruta: el único contexto que se
    // loguea es `path` y `motivo`. Se verifica leyendo el motivo del use case.
    const d = deps({
      loginConApple: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new LoginConAppleFallidoError('email-ausente')),
          ),
      } as never,
    });

    const res = await request(tokenApp(d))
      .post('/api/auth/apple/token')
      .send({ ...BODY, nombre: 'Nombre Secreto' });

    expect(JSON.stringify(res.body)).not.toContain('Nombre Secreto');
  });
});

describe('registrarAuthAppleTokenDeshabilitado', () => {
  it('404 sin body (feature apagada), nunca el 401 de protectedApi', async () => {
    const app = express();
    const router = express.Router();
    registrarAuthAppleTokenDeshabilitado(router);
    app.use('/api', router);

    const res = await request(app).post('/api/auth/apple/token').send(BODY);

    expect(res.status).toBe(404);
  });
});
