import type { PrismaClient } from '@prisma/client';
import { crearAuthGoogle } from './crear-auth-google';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { IdentidadExterna } from '../application/ports/verificador-identidad-externa.port';

function fakePrisma(
  findUniqueImpl: (args: unknown) => unknown = () => null,
): PrismaClient {
  return {
    user: { findUnique: vi.fn(findUniqueImpl) },
  } as unknown as PrismaClient;
}

/**
 * crearAuthGoogle(prisma, env, blindIndex) — design §4.3.
 *
 * Cubre la activación por presencia (C1.3): `undefined` cuando falta
 * cualquiera de las dos credenciales, un `GoogleAuthGraph` completo cuando
 * ambas están presentes, la construcción interna (no inyectada) de los
 * colaboradores stateless, y la reutilización de la MISMA instancia de
 * `blindIndex` que recibe el composition root.
 */
describe('crearAuthGoogle (design §4.3)', () => {
  it('retorna undefined cuando falta GOOGLE_CLIENT_ID', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(fakePrisma(), env, blindIndex);

    expect(graph).toBeUndefined();
  });

  it('retorna undefined cuando falta GOOGLE_CLIENT_SECRET', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(fakePrisma(), env, blindIndex);

    expect(graph).toBeUndefined();
  });

  it('retorna undefined cuando faltan ambas credenciales (feature apagada por defecto)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(fakePrisma(), env, blindIndex);

    expect(graph).toBeUndefined();
  });

  it('retorna un GoogleAuthGraph completo (iniciador, loginConGoogle, googleRateLimiter) cuando ambas credenciales están presentes', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(fakePrisma(), env, blindIndex);

    expect(graph).toBeDefined();
    expect(graph!.iniciador).toBeDefined();
    expect(graph!.loginConGoogle).toBeDefined();
    expect(graph!.googleRateLimiter).toBeDefined();
    expect(typeof graph!.googleRateLimiter.isBlocked).toBe('function');
  });

  it('construye sus colaboradores (reloj/tokens/sessions) INTERNAMENTE — la firma solo acepta prisma/env/blindIndex, nunca los recibe como parámetro (design §4.3)', () => {
    expect(crearAuthGoogle.length).toBe(3);
  });

  it('usa la MISMA instancia de blindIndex recibida — nunca una re-derivación (4R carry-forward, design §5.5)', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const computeSpy = vi.fn().mockReturnValue('blind-index-de-esta-instancia');
    const blindIndex: IBlindIndexService = { compute: computeSpy };

    const graph = crearAuthGoogle(fakePrisma(), env, blindIndex);

    // No hay match por googleSub ni por email → 'sin-match'. Lo que importa
    // es que buscarPorEmail (alcanzado tras el gate de emailVerificado) haya
    // invocado EXACTAMENTE esta instancia de blindIndex — si crearAuthGoogle
    // re-derivara una nueva, este spy jamás se llamaría.
    const identidad: IdentidadExterna = {
      sub: 'google-sub-inexistente',
      email: 'nadie@ejemplo.cl',
      emailVerificado: true,
    };

    await graph!.loginConGoogle.execute(identidad);

    expect(computeSpy).toHaveBeenCalledWith('nadie@ejemplo.cl');
  });
});
