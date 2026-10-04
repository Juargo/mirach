import type { PrismaClient } from '@prisma/client';
import { crearAuthApple } from './crear-auth-apple';
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
});
