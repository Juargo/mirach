import type { PrismaClient } from '@prisma/client';
import { crearAuth } from './crear-auth';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';

const fakeCrypto: ICryptoService = {
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
};
const fakeBlindIndex: IBlindIndexService = {
  compute: (v: string) => v,
};

/**
 * crearAuth(prisma, env) — cobertura del mapeo `env.LOGIN_RATELIMIT_* ->
 * RateLimitConfig` (ADR-029, ENV-06). No existía spec propio: el mapeo solo
 * se ejercitaba indirectamente por `login-rate-limiter.spec.ts` (que prueba
 * comportamiento, no el wiring desde `env`) y `container.spec.ts` (que no
 * inspecciona `loginRateLimiter`).
 *
 * Usa 3 valores DISTINTOS entre sí para que un swap de campos (ej.
 * EMAIL<->IP) rompa el test en vez de pasar por casualidad con valores
 * intercambiables.
 */
describe('crearAuth — mapeo env.LOGIN_RATELIMIT_* -> RateLimitConfig', () => {
  function fakePrisma(): PrismaClient {
    return {} as unknown as PrismaClient;
  }

  it('construye loginRateLimiter con maxAttemptsPerEmail/maxAttemptsPerIp/windowMs desde env', () => {
    const env = buildTestEnv({
      LOGIN_RATELIMIT_MAX_EMAIL: 7,
      LOGIN_RATELIMIT_MAX_IP: 33,
      LOGIN_RATELIMIT_WINDOW_MS: 123456,
    });

    const auth = crearAuth(fakePrisma(), env, fakeCrypto, fakeBlindIndex);

    expect(auth.loginRateLimiter.configuracion).toEqual({
      maxAttemptsPerEmail: 7,
      maxAttemptsPerIp: 33,
      windowMs: 123456,
    });
  });
});
