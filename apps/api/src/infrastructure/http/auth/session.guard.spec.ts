import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';
import { Result } from '../../../shared/result';

/**
 * Verificación de control de acceso (ADR-015). Mirrors api-key.guard.spec.ts's
 * shape: mocked Reflector + mocked request, exercising every guard path.
 */

function contextMock(opts: {
  cookie?: string;
  authorization?: string;
  isPublic?: boolean;
  isSessionPublic?: boolean;
}): { ctx: ExecutionContext; reflector: Reflector; request: Record<string, unknown> } {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === 'isPublic') return opts.isPublic ?? false;
      if (key === 'isSessionPublic') return opts.isSessionPublic ?? false;
      return false;
    },
  } as unknown as Reflector;

  const request: Record<string, unknown> = {
    headers: { cookie: opts.cookie, authorization: opts.authorization },
  };

  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, reflector, request };
}

function validarSesionMock(result: ReturnType<ValidarSesionUseCase['execute']>) {
  return {
    execute: vi.fn().mockReturnValue(result),
  } as unknown as ValidarSesionUseCase;
}

describe('SessionGuard', () => {
  it('deja pasar los endpoints @Public() sin validar sesión', async () => {
    const { ctx, reflector } = contextMock({ isPublic: true });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'no-debería-llamarse' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(validarSesion.execute).not.toHaveBeenCalled();
  });

  it('deja pasar los endpoints @PublicSession() sin validar sesión', async () => {
    const { ctx, reflector } = contextMock({ isSessionPublic: true });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'no-debería-llamarse' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(validarSesion.execute).not.toHaveBeenCalled();
  });

  it('autoriza y setea request.userId con cookie válida únicamente', async () => {
    const { ctx, reflector, request } = contextMock({ cookie: 'md_session=token-cookie' });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'user-1' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.userId).toBe('user-1');
    expect(validarSesion.execute).toHaveBeenCalledWith({ token: 'token-cookie' });
  });

  it('autoriza y setea request.userId con Bearer válido únicamente', async () => {
    const { ctx, reflector, request } = contextMock({
      authorization: 'Bearer token-bearer',
    });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'user-2' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.userId).toBe('user-2');
    expect(validarSesion.execute).toHaveBeenCalledWith({ token: 'token-bearer' });
  });

  it('precedencia de cookie: cookie válida + Bearer basura → valida SOLO el token de la cookie', async () => {
    const { ctx, reflector } = contextMock({
      cookie: 'md_session=token-cookie',
      authorization: 'Bearer token-basura',
    });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'user-1' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await guard.canActivate(ctx);

    expect(validarSesion.execute).toHaveBeenCalledWith({ token: 'token-cookie' });
    expect(validarSesion.execute).not.toHaveBeenCalledWith({ token: 'token-basura' });
  });

  it('401 cuando ambos transportes están ausentes', async () => {
    const { ctx, reflector } = contextMock({});
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.ok({ userId: 'no-debería-llamarse' })),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(validarSesion.execute).not.toHaveBeenCalled();
  });

  it('401 cuando el token (de cualquier transporte) es inválido', async () => {
    const { ctx, reflector } = contextMock({ cookie: 'md_session=token-invalido' });
    const validarSesion = validarSesionMock(
      Promise.resolve(Result.fail(new SesionInvalidaError())),
    );
    const guard = new SessionGuard(reflector, validarSesion);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
