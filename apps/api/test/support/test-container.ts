import type { PrismaClient } from '@prisma/client';

import type { Env } from '../../src/config/env';
import {
  createContainer,
  type Container,
} from '../../src/composition/container';
import { deriveBlindIndexKey } from '../../src/composition/derive-blind-index-key';
import { LoginUseCase } from '../../src/application/use-cases/login.use-case';
import { Email } from '../../src/domain/value-objects/email';
import { Argon2PasswordHasher } from '../../src/infrastructure/http/auth/argon2-password-hasher';
import { Sha256SessionTokenService } from '../../src/infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../../src/infrastructure/http/auth/system-reloj';
import { AesGcmCryptoService } from '../../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../../src/infrastructure/persistence/hmac-blind-index.service';
import { PrismaSessionRepository } from '../../src/infrastructure/persistence/prisma-session.repository';
import { PrismaUserCredentialRepository } from '../../src/infrastructure/persistence/prisma-user-credential.repository';

/**
 * createTestContainer — the real container, with the ADR-051 password-login
 * allowlist opened for the specs that sign in with password-seeded users.
 *
 * Production allows password login for exactly one configured email
 * (`REVIEW_LOGIN_EMAIL`; unset = nobody). The integration/e2e specs seed many
 * throwaway users with random emails and log them in, so they cannot share one
 * fixed allowlisted address. This helper swaps ONLY the `login` use case for a
 * facade that builds the real `LoginUseCase` per request with the requesting
 * email as the allowlisted one. Lookup, password verification and session
 * creation stay the real code; only the allowlist gate is opened. The gate
 * itself is covered by login.use-case.spec.ts and by the default-container
 * refusal case in auth-login.e2e-spec.ts.
 *
 * Production code is untouched: no NODE_ENV branch, no env parsing change.
 */
export function createTestContainer(env: Env, prisma: PrismaClient): Container {
  const container = createContainer(env, prisma);

  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  const creds = new PrismaUserCredentialRepository(
    prisma,
    new AesGcmCryptoService(key),
    new HmacBlindIndexService(deriveBlindIndexKey(key)),
  );
  const hasher = new Argon2PasswordHasher();
  const sessions = new PrismaSessionRepository(prisma);
  const tokens = new Sha256SessionTokenService();
  const reloj = new SystemReloj();

  class LoginAbiertoParaTests extends LoginUseCase {
    override execute(input: { emailRaw: string; password: string }) {
      const parsed = Email.crear(input.emailRaw);
      const emailPermitido = parsed.isOk() ? parsed.getValue() : null;
      return new LoginUseCase(
        creds,
        hasher,
        sessions,
        tokens,
        reloj,
        container.logger,
        emailPermitido,
      ).execute(input);
    }
  }

  const loginAbierto = new LoginAbiertoParaTests(
    creds,
    hasher,
    sessions,
    tokens,
    reloj,
    container.logger,
    null,
  );

  return { ...container, login: loginAbierto };
}
