import { Reflector } from '@nestjs/core';
import {
  UnauthorizedException,
  InternalServerErrorException,
  ExecutionContext,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Verificación de control de acceso (ADR-015 — énfasis en aislamiento/acceso).
 * El guard es la única barrera que impide exponer datos financieros al
 * desplegar la API, así que se cubren todos sus caminos.
 */

const KEY_VALIDA = 'a'.repeat(64);

function contextMock(opts: {
  header?: string;
  isPublic?: boolean;
}): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: () => opts.isPublic ?? false,
  } as unknown as Reflector;

  const request = {
    header: (name: string) =>
      name.toLowerCase() === 'x-api-key' ? opts.header : undefined,
  };

  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, reflector };
}

describe('ApiKeyGuard', () => {
  const envOriginal = process.env.API_KEY;

  afterEach(() => {
    process.env.API_KEY = envOriginal;
  });

  it('deja pasar los endpoints @Public() sin exigir key', () => {
    delete process.env.API_KEY; // ni siquiera mira el env si es público
    const { ctx, reflector } = contextMock({ isPublic: true });
    const guard = new ApiKeyGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza TODO (500) si API_KEY no está configurada — fail-closed', () => {
    delete process.env.API_KEY;
    const { ctx, reflector } = contextMock({ header: KEY_VALIDA });
    const guard = new ApiKeyGuard(reflector);
    expect(() => guard.canActivate(ctx)).toThrow(InternalServerErrorException);
  });

  it('rechaza TODO (500) si API_KEY es demasiado corta', () => {
    process.env.API_KEY = 'corta';
    const { ctx, reflector } = contextMock({ header: 'corta' });
    const guard = new ApiKeyGuard(reflector);
    expect(() => guard.canActivate(ctx)).toThrow(InternalServerErrorException);
  });

  it('401 si falta el header x-api-key', () => {
    process.env.API_KEY = KEY_VALIDA;
    const { ctx, reflector } = contextMock({});
    const guard = new ApiKeyGuard(reflector);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('401 si la key es incorrecta', () => {
    process.env.API_KEY = KEY_VALIDA;
    const { ctx, reflector } = contextMock({ header: 'b'.repeat(64) });
    const guard = new ApiKeyGuard(reflector);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('deja pasar (200) con la key correcta', () => {
    process.env.API_KEY = KEY_VALIDA;
    const { ctx, reflector } = contextMock({ header: KEY_VALIDA });
    const guard = new ApiKeyGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
