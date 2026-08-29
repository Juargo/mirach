import express, { type Express } from 'express';
import request from 'supertest';
import { sessionMiddleware } from './session.middleware';
import { Result } from '../../../shared/result';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';
import { COOKIE_NAME } from '../../http/auth/cookie';
import { appLogger } from '../../logging/app-logger';
import type { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';

/**
 * Verificación de aislamiento por sesión (ADR-015 — RNF-SEC-006). Port 1:1 del
 * `SessionGuard` a middleware: exige token (cookie O Bearer), delega la
 * validación al mismo `ValidarSesionUseCase`, y expone `req.userId` en éxito.
 *
 * Se inyecta un doble del use case (closure-DI): el middleware no conoce ni la
 * DB ni el hashing — solo el transporte.
 */
type ValidarDoble = Pick<ValidarSesionUseCase, 'execute'>;

function probeApp(validar: ValidarDoble): Express {
  const app = express();
  app.use(sessionMiddleware(validar as ValidarSesionUseCase));
  app.get('/probe', (req, res) =>
    res.status(200).json({
      userId: req.userId,
      esDemo: req.esDemo,
      sessionTokenHash: req.sessionTokenHash ?? null,
    }),
  );
  return app;
}

describe('sessionMiddleware', () => {
  it('401 sin token (ni cookie ni Bearer) — no llama al use case', async () => {
    const validar = { execute: vi.fn() };
    const res = await request(probeApp(validar)).get('/probe');
    expect(res.status).toBe(401);
    expect(validar.execute).not.toHaveBeenCalled();
  });

  it('401 si el token es inválido/expirado — req.sessionTokenHash queda undefined', async () => {
    const validar = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new SesionInvalidaError())),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-malo');
    expect(res.status).toBe(401);
  });

  it('deja pasar (200) y expone req.userId con token válido (Bearer)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-123',
          esDemo: false,
          tokenHash: 'hash-bueno',
        }),
      ),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-bueno');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-123',
      esDemo: false,
      sessionTokenHash: 'hash-bueno',
    });
  });

  it('expone req.esDemo = true para una sesión demo (CAT038-08)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-demo',
          esDemo: true,
          tokenHash: 'hash-demo',
        }),
      ),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-demo');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-demo',
      esDemo: true,
      sessionTokenHash: 'hash-demo',
    });
  });

  it('expone req.sessionTokenHash = sesion.tokenHash en éxito (PERF040-06)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-1',
          esDemo: false,
          tokenHash: 'el-hash-de-la-sesion',
        }),
      ),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-valido');
    expect(res.body.sessionTokenHash).toBe('el-hash-de-la-sesion');
  });

  it('invariante (issue #507): si ValidarSesionUseCase retornara un esDemo no-boolean, el middleware lo fuerza a true (fail-closed) y loguea error, en vez de propagar el valor malformado', async () => {
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});
    const validar = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'user-raro',
          // Malformado a propósito — el tipo `ValidarSesionResult.esDemo:
          // boolean` ya lo prohíbe en compile-time; este test cubre el caso
          // en que igual llega en runtime (bug de mapper/repo aguas abajo).
          esDemo: undefined as unknown as boolean,
          tokenHash: 'hash-raro',
        }),
      ),
    };

    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-raro');

    expect(res.status).toBe(200);
    expect(res.body.esDemo).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, context] = errorSpy.mock.calls[0];
    expect(String(message)).toContain('esDemo');
    expect(context).toEqual({ path: '/probe' });

    errorSpy.mockRestore();
  });

  it('la cookie md_session tiene precedencia sobre Bearer (AUTH-05)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          userId: 'from-cookie',
          esDemo: false,
          tokenHash: 'hash-cookie',
        }),
      ),
    };
    await request(probeApp(validar))
      .get('/probe')
      .set('Cookie', `${COOKIE_NAME}=token-cookie`)
      .set('Authorization', 'Bearer token-bearer');
    expect(validar.execute).toHaveBeenCalledWith({ token: 'token-cookie' });
  });
});
