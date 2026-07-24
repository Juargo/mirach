import express, { type Express } from 'express';
import request from 'supertest';
import { sessionMiddleware } from './session.middleware';
import { Result } from '../../../shared/result';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';
import { COOKIE_NAME } from '../../http/auth/cookie';
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
  app.get('/probe', (req, res) => res.status(200).json({ userId: req.userId }));
  return app;
}

describe('sessionMiddleware', () => {
  it('401 sin token (ni cookie ni Bearer) — no llama al use case', async () => {
    const validar = { execute: vi.fn() };
    const res = await request(probeApp(validar)).get('/probe');
    expect(res.status).toBe(401);
    expect(validar.execute).not.toHaveBeenCalled();
  });

  it('401 si el token es inválido/expirado', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-malo');
    expect(res.status).toBe(401);
  });

  it('deja pasar (200) y expone req.userId con token válido (Bearer)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-123' })),
    };
    const res = await request(probeApp(validar))
      .get('/probe')
      .set('Authorization', 'Bearer token-bueno');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-123' });
  });

  it('la cookie md_session tiene precedencia sobre Bearer (AUTH-05)', async () => {
    const validar = {
      execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'from-cookie' })),
    };
    await request(probeApp(validar))
      .get('/probe')
      .set('Cookie', `${COOKIE_NAME}=token-cookie`)
      .set('Authorization', 'Bearer token-bearer');
    expect(validar.execute).toHaveBeenCalledWith({ token: 'token-cookie' });
  });
});
