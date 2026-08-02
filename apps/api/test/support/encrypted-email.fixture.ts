import { AesGcmCryptoService } from '../../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../../src/composition/derive-blind-index-key';
import type { Env } from '../../src/config/env';

/** `User.email`/`emailBlindIndex` listos para persistir directo vía Prisma. */
export interface EncryptedEmailFields {
  readonly email: string;
  readonly emailBlindIndex: string;
}

/**
 * buildEncryptedEmailFields — cifra + computa el blind index de un email
 * EXACTAMENTE como lo hacen `container.ts` (login real) y `prisma/seed.ts`
 * (US-035): mismo `AesGcmCryptoService`, mismo `HmacBlindIndexService`, misma
 * derivación HKDF (`deriveBlindIndexKey`), a partir del `env.ENCRYPTION_KEY`
 * pasado por el caller.
 *
 * Los int/e2e specs que crean un `User` DIRECTO vía `prisma.user.create/
 * upsert` (bypaseando `prisma/seed.ts`) necesitan este helper — desde que
 * `PrismaUserCredentialRepository.buscarPorEmail` busca por
 * `emailBlindIndex` en vez de por email en claro, un spec que siga
 * escribiendo `email: EMAIL` (texto plano, sin índice) crea un usuario que
 * NUNCA puede loguearse (buscarPorEmail no lo encuentra).
 *
 * `email` viene SIEMPRE de `loadEnv()` en estos specs (nunca hardcodeado) —
 * así la clave con la que se cifra/indexa acá coincide con la que usa la app
 * real levantada por `createContainer(env, prisma)` en el mismo spec.
 */
export function buildEncryptedEmailFields(
  emailRaw: string,
  env: Pick<Env, 'ENCRYPTION_KEY'>,
): EncryptedEmailFields {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  const crypto = new AesGcmCryptoService(key);
  const blindIndex = new HmacBlindIndexService(deriveBlindIndexKey(key));
  const normalized = emailRaw.trim().toLowerCase();

  return {
    email: crypto.encrypt(normalized),
    emailBlindIndex: blindIndex.compute(normalized),
  };
}
