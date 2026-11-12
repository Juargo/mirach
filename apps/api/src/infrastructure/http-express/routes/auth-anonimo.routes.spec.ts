import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarAuthAnonimo,
  type AuthAnonimoDeps,
} from './auth-anonimo.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { AltaAnonimaFallidaError } from '../../../domain/errors/alta-anonima-fallida.error';

function deps(over: Partial<AuthAnonimoDeps> = {}): AuthAnonimoDeps {
  return {
    crearCuentaAnonima: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          token: 'tok',
          userId: 'anon-1',
          expiresAt: new Date('2027-11-12T00:00:00.000Z'),
        }),
      ),
    },
    altaRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    ...over,
  } as unknown as AuthAnonimoDeps;
}

function app(d: AuthAnonimoDeps): Express {
  const a = express();
  a.use(express.json());
  const router = express.Router();
  registrarAuthAnonimo(router, d);
  a.use('/api', router);
  a.use(errorMiddleware);
  return a;
}

describe('POST /api/auth/anonimo (ADR-013)', () => {
  it('creates the account with the accepted versions and answers the session', async () => {
    const d = deps();

    const res = await request(app(d))
      .post('/api/auth/anonimo')
      .send({ versionTerminos: '1.0', versionPrivacidad: '1.1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'tok',
      userId: 'anon-1',
      expiresAt: '2027-11-12T00:00:00.000Z',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(d.crearCuentaAnonima.execute).toHaveBeenCalledWith({
      terminos: '1.0',
      privacidad: '1.1',
    });
  });

  it('counts every sign-up against the IP budget and never releases it', async () => {
    const d = deps();

    await request(app(d)).post('/api/auth/anonimo').send({});

    expect(d.altaRateLimiter.recordFailure).toHaveBeenCalledTimes(1);
    expect(d.altaRateLimiter.reset).not.toHaveBeenCalled();
  });

  it('answers 429 without creating anything when the IP is over its budget', async () => {
    const d = deps({
      altaRateLimiter: {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as AuthAnonimoDeps['altaRateLimiter'],
    });

    const res = await request(app(d)).post('/api/auth/anonimo').send({});

    expect(res.status).toBe(429);
    expect(d.crearCuentaAnonima.execute).not.toHaveBeenCalled();
  });

  it('answers 400 TERMINOS_NO_ACEPTADOS when the terms rule rejects the sign-up', async () => {
    const d = deps({
      crearCuentaAnonima: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new AltaAnonimaFallidaError('terminos-no-aceptados')),
          ),
      } as unknown as AuthAnonimoDeps['crearCuentaAnonima'],
    });

    const res = await request(app(d)).post('/api/auth/anonimo').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMINOS_NO_ACEPTADOS');
  });

  it('a non-string version reaches the use case as an invalid value, never as "absent"', async () => {
    const d = deps();

    await request(app(d))
      .post('/api/auth/anonimo')
      .send({ versionTerminos: 7, versionPrivacidad: '1.0' });

    expect(d.crearCuentaAnonima.execute).toHaveBeenCalledWith({
      terminos: '',
      privacidad: '1.0',
    });
  });

  it('answers 503 when a collaborator throws', async () => {
    const d = deps({
      crearCuentaAnonima: {
        execute: vi.fn().mockRejectedValue(new Error('db down')),
      } as unknown as AuthAnonimoDeps['crearCuentaAnonima'],
    });

    const res = await request(app(d)).post('/api/auth/anonimo').send({});

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
