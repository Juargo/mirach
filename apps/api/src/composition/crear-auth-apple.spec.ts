import type { PrismaClient } from '@prisma/client';
import { crearAuthApple } from './crear-auth-apple';
import { Result } from '../shared/result';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import { NoOpLogger } from '../../test/support/logger.double';
import { AppleIdTokenVerifier } from '../infrastructure/oidc/apple-id-token.adapter';
import { LoginConAppleUseCase } from '../application/use-cases/login-con-apple.use-case';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';

const blindIndex: IBlindIndexService = { compute: vi.fn() };
const crypto: ICryptoService = { encrypt: (v) => v, decrypt: (v) => v };
const prisma = {} as PrismaClient;

describe('crearAuthApple', () => {
  it('retorna undefined cuando APPLE_BUNDLE_ID está ausente (feature apagada)', () => {
    const env = buildTestEnv({ APPLE_BUNDLE_ID: undefined });

    expect(
      crearAuthApple(prisma, env, blindIndex, crypto, new NoOpLogger()),
    ).toBeUndefined();
  });

  it('con APPLE_BUNDLE_ID arma verificador, use case y limitador propio', () => {
    const env = buildTestEnv({ APPLE_BUNDLE_ID: 'cl.mirach.app' });

    const graph = crearAuthApple(
      prisma,
      env,
      blindIndex,
      crypto,
      new NoOpLogger(),
    );

    expect(graph?.verificadorIdToken).toBeInstanceOf(AppleIdTokenVerifier);
    expect(graph?.loginConApple).toBeInstanceOf(LoginConAppleUseCase);
    expect(graph?.appleTokenRateLimiter).toBeInstanceOf(IpRateLimiter);
  });

  it('con cliente de Apple REST: un id_token del canje que no verifica NO se guarda y el token se revoca (T4)', async () => {
    const env = buildTestEnv({ APPLE_BUNDLE_ID: 'cl.mirach.app' });
    const intercambiarCodigo = vi
      .fn()
      .mockResolvedValue(
        Result.ok({ refreshToken: 'rt-1', idToken: 'no.es.jwt' }),
      );
    const revocarRefreshToken = vi.fn().mockResolvedValue(Result.ok(undefined));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prismaFake = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', appleSub: 's' }),
        updateMany,
      },
      session: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

    const graph = crearAuthApple(
      prismaFake,
      env,
      blindIndex,
      crypto,
      new NoOpLogger(),
      { intercambiarCodigo, revocarRefreshToken },
    );
    await graph?.loginConApple.execute(
      { sub: 's', email: null, emailVerificado: false, emailPrivado: false },
      null,
      'code-1',
    );

    expect(intercambiarCodigo).toHaveBeenCalledWith('code-1');
    expect(updateMany).not.toHaveBeenCalled();
    expect(revocarRefreshToken).toHaveBeenCalledWith('rt-1');
  });
});
