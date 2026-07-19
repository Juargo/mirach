import type { Mock } from 'vitest';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../../../application/use-cases/crear-demo.use-case';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { LoginRateLimiter } from './login-rate-limiter';
import { DemoRateLimiter } from './demo-rate-limiter';
import { DemoCleanupService } from './demo-cleanup.service';
import { Result } from '../../../shared/result';
import { CredencialesInvalidasError } from '../../../domain/errors/credenciales-invalidas.error';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';

function requestMock(
  opts: {
    cookie?: string;
    authorization?: string;
    path?: string;
    secFetchDest?: string;
    secFetchMode?: string;
  } = {},
): Request {
  return {
    headers: {
      cookie: opts.cookie,
      authorization: opts.authorization,
      'x-forwarded-for': undefined,
      'sec-fetch-dest': opts.secFetchDest,
      'sec-fetch-mode': opts.secFetchMode,
    },
    socket: { remoteAddress: '127.0.0.1' },
    path: opts.path ?? '/api/auth/login',
  } as unknown as Request;
}

function responseMock(): Response & { setHeader: Mock; redirect: Mock } {
  return { setHeader: vi.fn(), redirect: vi.fn() } as unknown as Response & {
    setHeader: Mock;
    redirect: Mock;
  };
}

/** Construye un AuthController con dependencias demo "vacías" — usadas por los tests de login/logout/me que no ejercitan el flujo demo. */
function makeController(
  loginUseCase: LoginUseCase,
  logoutUseCase: LogoutUseCase,
  identidadUseCase: ObtenerIdentidadUseCase,
  rateLimiter: LoginRateLimiter,
): AuthController {
  return new AuthController(
    loginUseCase,
    logoutUseCase,
    identidadUseCase,
    rateLimiter,
    {} as DemoRateLimiter,
    {} as CrearDemoUseCase,
    {} as DemoCleanupService,
    {} as ValidarSesionUseCase,
  );
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
      const controller = makeController(loginUseCase, logoutUseCase, identidadUseCase, rateLimiter);

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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
      const controller = makeController(
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
          .mockResolvedValue(
            Result.ok({ userId: 'user-1', email: 'user@example.com', esDemo: false }),
          ),
      } as unknown as ObtenerIdentidadUseCase;
      const controller = makeController(
        {} as LoginUseCase,
        {} as LogoutUseCase,
        identidadUseCase,
        {} as LoginRateLimiter,
      );

      const dto = await controller.me('user-1');

      expect(identidadUseCase.execute as Mock).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(dto).toEqual({ userId: 'user-1', email: 'user@example.com', esDemo: false });
    });

    it('usuario demo → email null, esDemo true (DEMO-AUTH-05)', async () => {
      const identidadUseCase = {
        execute: vi
          .fn()
          .mockResolvedValue(Result.ok({ userId: 'user-demo-1', email: null, esDemo: true })),
      } as unknown as ObtenerIdentidadUseCase;
      const controller = makeController(
        {} as LoginUseCase,
        {} as LogoutUseCase,
        identidadUseCase,
        {} as LoginRateLimiter,
      );

      const dto = await controller.me('user-demo-1');

      expect(dto).toEqual({ userId: 'user-demo-1', email: null, esDemo: true });
    });

    it('identidad no encontrada (defensivo) → 401', async () => {
      const identidadUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
      } as unknown as ObtenerIdentidadUseCase;
      const controller = makeController(
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

  describe('GET /demo (DEMO-AUTH-01..04)', () => {
    function makeDemoDeps(overrides?: {
      demoRateLimiter?: Partial<DemoRateLimiter>;
      crearDemoUseCase?: Partial<CrearDemoUseCase>;
      demoCleanupService?: Partial<DemoCleanupService>;
      validarSesionUseCase?: Partial<ValidarSesionUseCase>;
      identidadUseCase?: Partial<ObtenerIdentidadUseCase>;
    }) {
      const demoRateLimiter = {
        isBlocked: vi.fn().mockReturnValue(false),
        recordFailure: vi.fn(),
        reset: vi.fn(),
        ...overrides?.demoRateLimiter,
      } as unknown as DemoRateLimiter;
      const crearDemoUseCase = {
        execute: vi.fn().mockResolvedValue({
          token: 'demo-token-abc',
          userId: 'user-demo-1',
          expiresAt: new Date('2026-07-25T00:00:00.000Z'),
        }),
        ...overrides?.crearDemoUseCase,
      } as unknown as CrearDemoUseCase;
      const demoCleanupService = {
        borrarExpirados: vi.fn().mockResolvedValue(0),
        ...overrides?.demoCleanupService,
      } as unknown as DemoCleanupService;
      const validarSesionUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
        ...overrides?.validarSesionUseCase,
      } as unknown as ValidarSesionUseCase;
      const identidadUseCase = {
        execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
        ...overrides?.identidadUseCase,
      } as unknown as ObtenerIdentidadUseCase;

      return { demoRateLimiter, crearDemoUseCase, demoCleanupService, validarSesionUseCase, identidadUseCase };
    }

    function makeDemoController(deps: ReturnType<typeof makeDemoDeps>): AuthController {
      return new AuthController(
        {} as LoginUseCase,
        {} as LogoutUseCase,
        deps.identidadUseCase,
        {} as LoginRateLimiter,
        deps.demoRateLimiter,
        deps.crearDemoUseCase,
        deps.demoCleanupService,
        deps.validarSesionUseCase,
      );
    }

    it('bloqueado por el rate limiter → 429, no limpia ni crea nada', async () => {
      const deps = makeDemoDeps({ demoRateLimiter: { isBlocked: vi.fn().mockReturnValue(true) } });
      const controller = makeDemoController(deps);

      await expect(controller.demo(requestMock(), responseMock())).rejects.toMatchObject({
        status: 429,
      });
      expect(deps.demoCleanupService.borrarExpirados).not.toHaveBeenCalled();
      expect(deps.crearDemoUseCase.execute).not.toHaveBeenCalled();
    });

    it('sin cookie/token → limpia expirados ANTES de crear el demo (orden probado, no solo conteo), setea cookie y redirige 302 a /', async () => {
      const deps = makeDemoDeps();
      const controller = makeDemoController(deps);
      const res = responseMock();

      const llamadas: string[] = [];
      (deps.demoCleanupService.borrarExpirados as Mock).mockImplementation(async () => {
        llamadas.push('borrarExpirados');
        return 0;
      });
      (deps.crearDemoUseCase.execute as Mock).mockImplementation(async () => {
        llamadas.push('crearDemoUseCase.execute');
        return {
          token: 'demo-token-abc',
          userId: 'user-demo-1',
          expiresAt: new Date('2026-07-25T00:00:00.000Z'),
        };
      });

      await controller.demo(requestMock(), res);

      // Prueba el ORDEN real (no solo toHaveBeenCalledTimes) — un futuro
      // Promise.all no podría violar silenciosamente DEMO-CLN-02.
      expect(llamadas).toEqual(['borrarExpirados', 'crearDemoUseCase.execute']);
      expect(deps.demoRateLimiter.recordFailure).toHaveBeenCalledWith('127.0.0.1');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('md_session=demo-token-abc'),
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });

    it('Sec-Fetch-Dest: image (embebido vía <img>, amplificación anti-rate-limit) → 403, no limpia ni crea nada', async () => {
      const deps = makeDemoDeps();
      const controller = makeDemoController(deps);

      await expect(
        controller.demo(requestMock({ secFetchDest: 'image' }), responseMock()),
      ).rejects.toMatchObject({ status: 403 });
      expect(deps.demoCleanupService.borrarExpirados).not.toHaveBeenCalled();
      expect(deps.crearDemoUseCase.execute).not.toHaveBeenCalled();
      expect(deps.demoRateLimiter.isBlocked).not.toHaveBeenCalled();
    });

    it('Sec-Fetch-Mode: cors (no es navigate) → 403, no limpia ni crea nada', async () => {
      const deps = makeDemoDeps();
      const controller = makeDemoController(deps);

      await expect(
        controller.demo(requestMock({ secFetchMode: 'cors' }), responseMock()),
      ).rejects.toMatchObject({ status: 403 });
      expect(deps.crearDemoUseCase.execute).not.toHaveBeenCalled();
    });

    it('Sec-Fetch-Dest: document + Sec-Fetch-Mode: navigate (navegación top-level real) → continúa normalmente', async () => {
      const deps = makeDemoDeps();
      const controller = makeDemoController(deps);
      const res = responseMock();

      await controller.demo(
        requestMock({ secFetchDest: 'document', secFetchMode: 'navigate' }),
        res,
      );

      expect(deps.crearDemoUseCase.execute).toHaveBeenCalledTimes(1);
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });

    it('borrarExpirados() rechaza (fallo transitorio de DB) → igual crea el demo, la request no se bloquea (isla degradable)', async () => {
      const deps = makeDemoDeps({
        demoCleanupService: {
          borrarExpirados: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        },
      });
      const controller = makeDemoController(deps);
      const res = responseMock();

      await controller.demo(requestMock(), res);

      expect(deps.crearDemoUseCase.execute).toHaveBeenCalledTimes(1);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('md_session=demo-token-abc'),
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });

    it('cookie con sesión demo válida (DEMO-AUTH-03) → reutiliza, NO crea nada nuevo', async () => {
      const deps = makeDemoDeps({
        validarSesionUseCase: {
          execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-demo-1' })),
        },
        identidadUseCase: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.ok({ userId: 'user-demo-1', email: null, esDemo: true })),
        },
      });
      const controller = makeDemoController(deps);
      const res = responseMock();

      await controller.demo(requestMock({ cookie: 'md_session=demo-token-vigente' }), res);

      expect(deps.crearDemoUseCase.execute).not.toHaveBeenCalled();
      expect(deps.demoCleanupService.borrarExpirados).not.toHaveBeenCalled();
      expect(deps.demoRateLimiter.isBlocked).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });

    it('cookie de sesión válida de un usuario REAL (no demo) → 302, NO crea demo, NO sobrescribe la cookie (FIX crítico anti session-clobber)', async () => {
      const deps = makeDemoDeps({
        validarSesionUseCase: {
          execute: vi.fn().mockResolvedValue(Result.ok({ userId: 'user-real-1' })),
        },
        identidadUseCase: {
          execute: vi.fn().mockResolvedValue(
            Result.ok({ userId: 'user-real-1', email: 'real@example.com', esDemo: false }),
          ),
        },
      });
      const controller = makeDemoController(deps);
      const res = responseMock();

      await controller.demo(requestMock({ cookie: 'md_session=token-usuario-real' }), res);

      // ANTES del fix: una sesión real válida caía al flujo de creación y su
      // cookie era pisada por una nueva sesión demo. Cualquier sesión VÁLIDA
      // (real o demo) debe cortar acá — solo la ausencia de sesión válida
      // dispara la creación de un demo nuevo.
      expect(deps.crearDemoUseCase.execute).not.toHaveBeenCalled();
      expect(deps.demoCleanupService.borrarExpirados).not.toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });

    it('cookie con token expirado/inválido (DEMO-AUTH-04) → cae al flujo de creación normal', async () => {
      const deps = makeDemoDeps({
        validarSesionUseCase: {
          execute: vi.fn().mockResolvedValue(Result.fail(new SesionInvalidaError())),
        },
      });
      const controller = makeDemoController(deps);
      const res = responseMock();

      await controller.demo(requestMock({ cookie: 'md_session=token-expirado' }), res);

      expect(deps.crearDemoUseCase.execute).toHaveBeenCalledTimes(1);
      expect(res.redirect).toHaveBeenCalledWith(302, '/');
    });
  });
});
