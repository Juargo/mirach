import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarCuentaVincular,
  type CuentaVincularDeps,
} from './cuenta-vincular.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { VinculacionFallidaError } from '../../../domain/errors/vinculacion-fallida.error';
import { VerificacionIdentidadFallidaError } from '../../../domain/errors/verificacion-identidad-fallida.error';

const SESION = {
  token: 'tok-nuevo',
  userId: 'anon-1',
  expiresAt: new Date('2026-11-19T00:00:00.000Z'),
};

const APPLE_BODY = {
  identityToken: 'jwt',
  nonce: 'nonce-crudo',
  nombre: 'Jorge',
  authorizationCode: 'code-1',
};

function deps(over: Partial<CuentaVincularDeps> = {}): CuentaVincularDeps {
  return {
    vincularIdentidad: {
      execute: vi.fn().mockResolvedValue(Result.ok(SESION)),
    },
    vincularRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    apple: {
      verificadorIdToken: {
        verificarIdToken: vi.fn().mockResolvedValue(
          Result.ok({
            sub: 'apple-sub-1',
            email: 'p@example.com',
            emailVerificado: true,
            emailPrivado: false,
          }),
        ),
      },
      loginConApple: { programarGuardadoRefreshToken: vi.fn() },
    },
    google: {
      verificadorIdToken: {
        verificarIdToken: vi.fn().mockResolvedValue(
          Result.ok({
            sub: 'google-sub-1',
            email: 'p@example.com',
            emailVerificado: true,
          }),
        ),
      },
    },
    ...over,
  } as unknown as CuentaVincularDeps;
}

function app(d: CuentaVincularDeps): Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = 'anon-1';
    req.sessionTokenHash = 'hash-anonimo';
    next();
  });
  const router = express.Router();
  registrarCuentaVincular(router, d);
  a.use('/api', router);
  a.use(errorMiddleware);
  return a;
}

function falla(motivo: 'cuenta-ya-existe' | 'cuenta-no-anonima') {
  return {
    execute: vi
      .fn()
      .mockResolvedValue(Result.fail(new VinculacionFallidaError(motivo))),
  } as unknown as CuentaVincularDeps['vincularIdentidad'];
}

describe('POST /api/cuenta/vincular/apple (ADR-013)', () => {
  it('links the verified Apple identity to the session user and answers the new session', async () => {
    const d = deps();

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send({ ...APPLE_BODY, userId: 'otro-usuario' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'tok-nuevo',
      userId: 'anon-1',
      expiresAt: '2026-11-19T00:00:00.000Z',
    });
    expect(d.apple!.verificadorIdToken.verificarIdToken).toHaveBeenCalledWith(
      'jwt',
      'nonce-crudo',
    );
    expect(d.vincularIdentidad.execute).toHaveBeenCalledWith({
      userId: 'anon-1',
      tokenHashActual: 'hash-anonimo',
      identidad: {
        proveedor: 'apple',
        sub: 'apple-sub-1',
        email: 'p@example.com',
        emailVerificado: true,
        emailPrivado: false,
      },
      nombre: 'Jorge',
    });
    expect(
      d.apple!.loginConApple.programarGuardadoRefreshToken,
    ).toHaveBeenCalledWith('anon-1', 'apple-sub-1', 'code-1');
    expect(d.vincularRateLimiter.reset).toHaveBeenCalledTimes(1);
  });

  it('answers 409 CUENTA_YA_EXISTE and stores no Apple token when the identity already has an account', async () => {
    const d = deps({ vincularIdentidad: falla('cuenta-ya-existe') });

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CUENTA_YA_EXISTE');
    expect(
      d.apple!.loginConApple.programarGuardadoRefreshToken,
    ).not.toHaveBeenCalled();
    expect(d.vincularRateLimiter.reset).not.toHaveBeenCalled();
  });

  it('answers 409 CUENTA_NO_ANONIMA when the caller already has credentials', async () => {
    const d = deps({ vincularIdentidad: falla('cuenta-no-anonima') });

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CUENTA_NO_ANONIMA');
  });

  it('an invalid identity token is 400 IDENTIDAD_INVALIDA, never 401 (a 401 would sign the anonymous person out)', async () => {
    const d = deps();
    vi.mocked(d.apple!.verificadorIdToken.verificarIdToken).mockResolvedValue(
      Result.fail(new VerificacionIdentidadFallidaError('firma-invalida')),
    );

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDENTIDAD_INVALIDA');
    expect(d.vincularIdentidad.execute).not.toHaveBeenCalled();
  });

  it('answers 503 when Apple cannot be reached', async () => {
    const d = deps();
    vi.mocked(d.apple!.verificadorIdToken.verificarIdToken).mockResolvedValue(
      Result.fail(
        new VerificacionIdentidadFallidaError('jwks-no-disponible', true),
      ),
    );

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(503);
  });

  it('answers 400 BODY_INVALIDO without verifying anything when the body is incomplete', async () => {
    const d = deps();

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send({ identityToken: 'jwt' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(d.apple!.verificadorIdToken.verificarIdToken).not.toHaveBeenCalled();
  });

  it('answers 429 when the IP is over its budget', async () => {
    const d = deps();
    vi.mocked(d.vincularRateLimiter.isBlocked).mockReturnValue(true);

    const res = await request(app(d))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(429);
    expect(d.apple!.verificadorIdToken.verificarIdToken).not.toHaveBeenCalled();
  });

  it('answers 404 when Sign in with Apple is not configured', async () => {
    const res = await request(app(deps({ apple: undefined })))
      .post('/api/cuenta/vincular/apple')
      .send(APPLE_BODY);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/cuenta/vincular/google (ADR-013)', () => {
  it('links the verified Google identity to the session user', async () => {
    const d = deps();

    const res = await request(app(d))
      .post('/api/cuenta/vincular/google')
      .send({ idToken: 'google-jwt' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('tok-nuevo');
    expect(d.google!.verificadorIdToken.verificarIdToken).toHaveBeenCalledWith(
      'google-jwt',
    );
    expect(d.vincularIdentidad.execute).toHaveBeenCalledWith({
      userId: 'anon-1',
      tokenHashActual: 'hash-anonimo',
      identidad: {
        proveedor: 'google',
        sub: 'google-sub-1',
        email: 'p@example.com',
        emailVerificado: true,
        emailPrivado: false,
      },
      nombre: null,
    });
  });

  it('answers 409 CUENTA_YA_EXISTE when the Google identity already has an account', async () => {
    const res = await request(
      app(deps({ vincularIdentidad: falla('cuenta-ya-existe') })),
    )
      .post('/api/cuenta/vincular/google')
      .send({ idToken: 'google-jwt' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CUENTA_YA_EXISTE');
  });

  it('answers 400 BODY_INVALIDO without an idToken', async () => {
    const res = await request(app(deps()))
      .post('/api/cuenta/vincular/google')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
  });

  it('answers 404 when Google sign-in for mobile is not configured', async () => {
    const res = await request(app(deps({ google: undefined })))
      .post('/api/cuenta/vincular/google')
      .send({ idToken: 'google-jwt' });

    expect(res.status).toBe(404);
  });
});
