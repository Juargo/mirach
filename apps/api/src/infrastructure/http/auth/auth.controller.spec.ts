import type { Mock } from 'vitest';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import { LoginRateLimiter } from './login-rate-limiter';
import { Result } from '../../../shared/result';
import { CredencialesInvalidasError } from '../../../domain/errors/credenciales-invalidas.error';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';

function requestMock(
  opts: { cookie?: string; authorization?: string; path?: string } = {},
): Request {
  return {
    headers: {
      cookie: opts.cookie,
      authorization: opts.authorization,
      'x-forwarded-for': undefined,
    },
    socket: { remoteAddress: '127.0.0.1' },
    path: opts.path ?? '/api/auth/login',
  } as unknown as Request;
}

function responseMock(): Response & { setHeader: Mock } {
  return { setHeader: vi.fn() } as unknown as Response & { setHeader: Mock };
}

describe('AuthController', () => {
  describe('POST /login', () => {
    it('bloqueado por el rate limiter → 429', async () => {
      const loginUseCase = { execute: vi.fn() } as unknown as LoginUseCase;
      const logoutUseCase = {} as LogoutUseCase;
      const identidadUseCase = {} as ObtenerIdentidadUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        logoutUseCase,
        identidadUseCase,
        rateLimiter,
      );

      await expect(
        controller.login(
          { email: 'user@example.com', password: 'x' },
          requestMock(),
          responseMock(),
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(loginUseCase.execute as Mock).not.toHaveBeenCalled();
    });

    it('LoginUseCase falla → 401 y recordFailure llamado', async () => {
      const loginUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new CredencialesInvalidasError())),
      } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      await expect(
        controller.login(
          { email: 'user@example.com', password: 'malo' },
          requestMock(),
          responseMock(),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(rateLimiter.recordFailure as Mock).toHaveBeenCalledWith(
        '127.0.0.1',
        'user@example.com',
      );
    });

    it('éxito → reset llamado, Set-Cookie seteado, body {token,userId,expiresAt}', async () => {
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');
      const loginUseCase = {
        execute: vi.fn().mockResolvedValue(
          Result.ok({ token: 'token-abc', userId: 'user-1', expiresAt }),
        ),
      } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const res = responseMock();
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      const body = await controller.login(
        { email: 'user@example.com', password: 'correcto' },
        requestMock(),
        res,
      );

      expect(rateLimiter.reset as Mock).toHaveBeenCalledWith(
        '127.0.0.1',
        'user@example.com',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('md_session=token-abc'),
      );
      expect(body).toEqual({
        token: 'token-abc',
        userId: 'user-1',
        expiresAt: expiresAt.toISOString(),
      });
    });

    it('concurrencia (race check-then-act): recordFailure se llama de forma optimista ANTES de esperar el use case', async () => {
      let resolveExecute!: (value: Awaited<ReturnType<LoginUseCase['execute']>>) => void;
      const executePromise = new Promise<Awaited<ReturnType<LoginUseCase['execute']>>>(
        (resolve) => {
          resolveExecute = resolve;
        },
      );
      const loginUseCase = {
        execute: vi.fn().mockReturnValue(executePromise),
      } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      const loginCall = controller.login(
        { email: 'user@example.com', password: 'x' },
        requestMock(),
        responseMock(),
      );

      // Before the use case resolves, the attempt must already be recorded —
      // otherwise N concurrent requests all pass isBlocked() before any
      // of them calls recordFailure (check-then-act race).
      expect(rateLimiter.recordFailure as Mock).toHaveBeenCalledWith(
        '127.0.0.1',
        'user@example.com',
      );
      expect(rateLimiter.recordFailure as Mock).toHaveBeenCalledTimes(1);

      resolveExecute(Result.fail(new CredencialesInvalidasError()));
      await expect(loginCall).rejects.toBeInstanceOf(UnauthorizedException);
      // Still only ONE recordFailure call for this one request (no double count).
      expect(rateLimiter.recordFailure as Mock).toHaveBeenCalledTimes(1);
    });

    it('éxito: el conteo registrado de forma optimista se limpia con reset (no queda contado)', async () => {
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');
      const loginUseCase = {
        execute: vi
          .fn()
          .mockResolvedValue(Result.ok({ token: 'token-abc', userId: 'user-1', expiresAt })),
      } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      await controller.login(
        { email: 'user@example.com', password: 'correcto' },
        requestMock(),
        responseMock(),
      );

      expect(rateLimiter.recordFailure as Mock).toHaveBeenCalledWith(
        '127.0.0.1',
        'user@example.com',
      );
      expect(rateLimiter.reset as Mock).toHaveBeenCalledWith(
        '127.0.0.1',
        'user@example.com',
      );
    });
  });

  describe('POST /login — observabilidad (scrubbed, sin PII/secretos, B3)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('loguea un warn (path + motivo) en la rama 401 de credenciales inválidas, sin email/password', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const loginUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new CredencialesInvalidasError())),
      } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      await expect(
        controller.login(
          { email: 'secreto@example.com', password: 'contraseña-secreta' },
          requestMock({ path: '/api/auth/login' }),
          responseMock(),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message] = warnSpy.mock.calls[0]!;
      expect(String(message)).toContain('/api/auth/login');
      expect(String(message)).not.toContain('secreto@example.com');
      expect(String(message)).not.toContain('contraseña-secreta');
    });

    it('loguea un warn (path + marcador de rate-limit) en la rama 429, sin email/password', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const loginUseCase = { execute: vi.fn() } as unknown as LoginUseCase;
      const rateLimiter = {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      } as unknown as LoginRateLimiter;
      const controller = new AuthController(
        loginUseCase,
        {} as LogoutUseCase,
        {} as ObtenerIdentidadUseCase,
        rateLimiter,
      );

      await expect(
        controller.login(
          { email: 'secreto@example.com', password: 'x' },
          requestMock({ path: '/api/auth/login' }),
          responseMock(),
        ),
      ).rejects.toMatchObject({ status: 429 });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message] = warnSpy.mock.calls[0]!;
      expect(String(message)).toContain('/api/auth/login');
      expect(String(message)).not.toContain('secreto@example.com');
    });
  });

  describe('POST /logout', () => {
    it('limpia la cookie con token presente', async () => {
      const logoutUseCase = {
        execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
      } as unknown as LogoutUseCase;
      const res = responseMock();
      const controller = new AuthController(
        {} as LoginUseCase,
        logoutUseCase,
        {} as ObtenerIdentidadUseCase,
        {} as LoginRateLimiter,
      );

      await controller.logout(requestMock({ cookie: 'md_session=token-abc' }), res);

      expect(logoutUseCase.execute as Mock).toHaveBeenCalledWith({ token: 'token-abc' });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('Max-Age=0'),
      );
    });

    it('limpia la cookie incluso sin token (idempotente)', async () => {
      const logoutUseCase = {
        execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
      } as unknown as LogoutUseCase;
      const res = responseMock();
      const controller = new AuthController(
        {} as LoginUseCase,
        logoutUseCase,
        {} as ObtenerIdentidadUseCase,
        {} as LoginRateLimiter,
      );

      await controller.logout(requestMock(), res);

      expect(logoutUseCase.execute as Mock).toHaveBeenCalledWith({ token: undefined });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('Max-Age=0'),
      );
    });
  });

  describe('GET /me', () => {
    it('delega a ObtenerIdentidadUseCase con el userId de @CurrentUser()', async () => {
      const identidadUseCase = {
        execute: vi
          .fn()
          .mockResolvedValue(Result.ok({ userId: 'user-1', email: 'user@example.com' })),
      } as unknown as ObtenerIdentidadUseCase;
      const controller = new AuthController(
        {} as LoginUseCase,
        {} as LogoutUseCase,
        identidadUseCase,
        {} as LoginRateLimiter,
      );

      const dto = await controller.me('user-1');

      expect(identidadUseCase.execute as Mock).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(dto).toEqual({ userId: 'user-1', email: 'user@example.com' });
    });

    it('identidad no encontrada (defensivo) → 401', async () => {
      const identidadUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
      } as unknown as ObtenerIdentidadUseCase;
      const controller = new AuthController(
        {} as LoginUseCase,
        {} as LogoutUseCase,
        identidadUseCase,
        {} as LoginRateLimiter,
      );

      await expect(controller.me('user-inexistente')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
