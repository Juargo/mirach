import express, { type Express } from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import {
  registrarAuthGoogleToken,
  registrarAuthGoogleTokenDeshabilitado,
  type AuthGoogleTokenDeps,
} from './auth-google-token.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { createRequestLoggerMiddleware } from '../middleware/request-logger.middleware';
import { createPinoLogger } from '../../logging/pino-logger';
import { Result } from '../../../shared/result';
import { LoginConGoogleFallidoError } from '../../../domain/errors/login-con-google-fallido.error';
import { VerificacionIdentidadFallidaError } from '../../../domain/errors/verificacion-identidad-fallida.error';
import type { LoginUseCaseResult } from '../../../application/use-cases/login.use-case';

/**
 * The generic 401 body MUST byte-match `/auth/login`'s failure body (AUTH-21)
 * — pinned literally here, not derived from any Google-specific error class
 * (`LoginConGoogleFallidoError.message` is a DIFFERENT string, "No pudimos
 * iniciar sesión con Google.", reserved for the web redirect flow's logging).
 */
const GENERIC_401_BODY = { message: 'Credenciales inválidas.' };

function deps(over: Partial<AuthGoogleTokenDeps> = {}): AuthGoogleTokenDeps {
  return {
    verificadorIdToken: {
      verificarIdToken: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ sub: 'sub-1', email: 'a@b.cl', emailVerificado: true }),
        ),
    },
    loginConGoogle: {
      execute: vi.fn().mockResolvedValue(
        Result.ok<LoginUseCaseResult>({
          token: 'tok',
          userId: 'user-1',
          expiresAt: new Date('2026-08-15T00:00:00.000Z'),
        }),
      ),
    },
    googleTokenRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
    },
    ...over,
  } as unknown as AuthGoogleTokenDeps;
}

function tokenApp(d: AuthGoogleTokenDeps): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registrarAuthGoogleToken(router, d);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

/** Logger que captura cada línea NDJSON emitida (mirror de request-logger.middleware.spec.ts). */
function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const pinoLogger = createPinoLogger({ level: 'info', destination });
  return { raw: pinoLogger.raw, output: () => lines.join('') };
}

function tokenAppWithLogger(
  d: AuthGoogleTokenDeps,
  raw: ReturnType<typeof captureLogger>['raw'],
): Express {
  const app = express();
  app.use(createRequestLoggerMiddleware(raw));
  app.use(express.json());
  const router = express.Router();
  registrarAuthGoogleToken(router, d);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarAuthGoogleToken — POST /api/auth/google/token', () => {
  it('200 con el mismo shape que LoginResponseDto (AUTH-20) y sin Set-Cookie (MOB-02)', async () => {
    const d = deps();
    const res = await request(tokenApp(d))
      .post('/api/auth/google/token')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'tok',
      userId: 'user-1',
      expiresAt: '2026-08-15T00:00:00.000Z',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    // Pins the wiring: la identidad que resuelve el verificador debe pasar
    // TAL CUAL a `loginConGoogle.execute` (mismo camino find-only de
    // `LoginConGoogleUseCase`, AUTH-20) — sin transformación intermedia.
    expect(d.loginConGoogle.execute).toHaveBeenCalledWith({
      sub: 'sub-1',
      email: 'a@b.cl',
      emailVerificado: true,
    });
  });

  /**
   * El double aquí modela el contrato REAL de `GoogleIdTokenVerifier`
   * (A1.5: `''` → `Result.fail`, sin llamada de red) — el short-circuit en
   * sí vive en el adapter, no en la ruta; este test solo fija que la ruta
   * PASA `''` sin distinguirlo, dejando que el verificador decida.
   */
  function verificadorQueRechazaVacio() {
    return {
      verificarIdToken: vi
        .fn()
        .mockImplementation((idToken: string) =>
          Promise.resolve(
            idToken === ''
              ? Result.fail(new VerificacionIdentidadFallidaError('vacio'))
              : Result.ok({ sub: 's', email: 'a@b.cl', emailVerificado: true }),
          ),
        ),
    };
  }

  it('idToken faltante → 401 genérico (nunca 400), la ruta pasa "" tal cual', async () => {
    const d = deps({ verificadorIdToken: verificadorQueRechazaVacio() });
    const res = await request(tokenApp(d))
      .post('/api/auth/google/token')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401_BODY);
    expect(d.verificadorIdToken.verificarIdToken).toHaveBeenCalledWith('');
  });

  it('idToken no-string → 401 genérico (mirrors /auth/login body handling)', async () => {
    const res = await request(
      tokenApp(
        deps({
          verificadorIdToken: verificadorQueRechazaVacio(),
        }),
      ),
    )
      .post('/api/auth/google/token')
      .send({ idToken: 12345 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401_BODY);
  });

  it('AUTH-23: un nonce inesperado en el body es ignorado, no rechazado — happy path procede igual', async () => {
    const res = await request(tokenApp(deps()))
      .post('/api/auth/google/token')
      .send({ idToken: 'valid-token', nonce: 'unexpected' });

    expect(res.status).toBe(200);
  });

  it.each([
    [
      'verificación de id_token falla (firma/aud/exp/JWKS)',
      () =>
        deps({
          verificadorIdToken: {
            verificarIdToken: vi
              .fn()
              .mockResolvedValue(
                Result.fail(
                  new VerificacionIdentidadFallidaError('id-token-invalido'),
                ),
              ),
          },
        }),
    ],
    [
      'JWKS/red falla dentro del verificador (mismo Result.fail, nunca 503)',
      () =>
        deps({
          verificadorIdToken: {
            verificarIdToken: vi
              .fn()
              .mockResolvedValue(
                Result.fail(
                  new VerificacionIdentidadFallidaError('jwks-fetch-failed'),
                ),
              ),
          },
        }),
    ],
    [
      'email no verificado',
      () =>
        deps({
          loginConGoogle: {
            execute: vi
              .fn()
              .mockResolvedValue(
                Result.fail(
                  new LoginConGoogleFallidoError('email-no-verificado'),
                ),
              ),
          } as never,
        }),
    ],
    [
      'ningún usuario coincide',
      () =>
        deps({
          loginConGoogle: {
            execute: vi
              .fn()
              .mockResolvedValue(
                Result.fail(new LoginConGoogleFallidoError('sin-match')),
              ),
          } as never,
        }),
    ],
    [
      'usuario demo',
      () =>
        deps({
          loginConGoogle: {
            execute: vi
              .fn()
              .mockResolvedValue(
                Result.fail(new LoginConGoogleFallidoError('usuario-demo')),
              ),
          } as never,
        }),
    ],
    [
      'ya vinculado a otro googleSub (regla ★)',
      () =>
        deps({
          loginConGoogle: {
            execute: vi
              .fn()
              .mockResolvedValue(
                Result.fail(
                  new LoginConGoogleFallidoError(
                    'ya-vinculado-a-otra-identidad',
                  ),
                ),
              ),
          } as never,
        }),
    ],
    [
      'throw inesperado del verificador',
      () =>
        deps({
          verificadorIdToken: {
            verificarIdToken: vi.fn().mockRejectedValue(new Error('boom')),
          },
        }),
    ],
    [
      'throw inesperado de loginConGoogle',
      () =>
        deps({
          loginConGoogle: {
            execute: vi.fn().mockRejectedValue(new Error('DB caída')),
          } as never,
        }),
    ],
  ] as const)(
    'AUTH-21: %s → 401 IDÉNTICO al de /auth/login (anti-enumeración)',
    async (_desc, buildDeps) => {
      const res = await request(tokenApp(buildDeps()))
        .post('/api/auth/google/token')
        .send({ idToken: 'a-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC_401_BODY);
      expect(res.headers['set-cookie']).toBeUndefined();
    },
  );

  it('429 tras exceder el presupuesto propio del rate limiter (google-token:ip:, AUTH-24) — verificador NUNCA invocado', async () => {
    const d = deps({
      googleTokenRateLimiter: {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
      } as never,
    });
    const res = await request(tokenApp(d))
      .post('/api/auth/google/token')
      .send({ idToken: 'a-token' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      message: 'Demasiadas solicitudes. Intenta más tarde.',
    });
    expect(res.body).not.toEqual(GENERIC_401_BODY);
    expect(d.verificadorIdToken.verificarIdToken).not.toHaveBeenCalled();
  });

  it('el valor de idToken NUNCA aparece en la línea NDJSON emitida (design §6.5, body no serializado por pino-http)', async () => {
    const { raw, output } = captureLogger();
    const secretToken = 'ey.SUPER-SECRET-ID-TOKEN.sig';

    await request(tokenAppWithLogger(deps(), raw))
      .post('/api/auth/google/token')
      .send({ idToken: secretToken });

    expect(output()).not.toContain(secretToken);
  });
});

describe('registrarAuthGoogleTokenDeshabilitado — POST /api/auth/google/token (feature off)', () => {
  it('404 cuando el feature está apagado (AUTH-22) — no cae a sessionMiddleware (evita el fallthrough 401)', async () => {
    const app = express();
    const router = express.Router();
    registrarAuthGoogleTokenDeshabilitado(router);
    app.use('/api', router);

    const res = await request(app)
      .post('/api/auth/google/token')
      .send({ idToken: 'x' });

    expect(res.status).toBe(404);
  });
});
