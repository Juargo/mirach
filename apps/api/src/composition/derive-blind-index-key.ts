import { hkdfSync } from 'node:crypto';

/**
 * derive-blind-index-key — deriva, vía HKDF, TODAS las claves derivadas del
 * mismo `ENCRYPTION_KEY` de AES-256 usado por `AesGcmCryptoService`
 * (ADR-013), sin introducir un env var nuevo: la clave HMAC del blind index
 * (`HmacBlindIndexService`, US-035) y la clave HMAC del link-intent firmado
 * que viaja en `md_oauth.link` (US-041). Vive en el composition root (no en
 * el adapter que la consume) porque construir/derivar claves es
 * responsabilidad del ensamblado, no del servicio que las usa.
 *
 * UNA `ENCRYPTION_KEY`, N claves purpose-separadas por `info`. `container.ts`,
 * `prisma/seed.ts` y `prisma/backfill-email-blind-index.ts` DEBEN llamar a
 * `deriveBlindIndexKey` con el mismo `ENCRYPTION_KEY` — si cualquiera
 * derivara la clave de otra forma, el blind index que escribe uno no
 * matchearía el que consulta otro (login roto en silencio). Misma disciplina
 * para `deriveLinkIntentKey`: un solo consumidor (`container.ts` →
 * `crearAuthGoogle`), nunca una segunda derivación (design §3.4).
 * Single-sourced a propósito (DRY): salt/hash/length son constantes
 * compartidas acá, cada `info` es la ÚNICA diferencia entre derivaciones —
 * nunca duplicadas inline en otro archivo.
 */

/** Salt vacío: la entropía viene íntegra de `ENCRYPTION_KEY` — no hay un segundo secreto disponible para usar como salt separado. */
const HKDF_SALT = Buffer.alloc(0);
/** Info fijo — namespacing del propósito de esta clave derivada (evita colisión si en el futuro se deriva otra clave del mismo `ENCRYPTION_KEY`). */
export const BLIND_INDEX_HKDF_INFO = 'blind-index-v1';
const BLIND_INDEX_KEY_LENGTH_BYTES = 32;
const HKDF_HASH = 'sha256';

/**
 * Deriva la clave HMAC de 32 bytes para `HmacBlindIndexService` a partir de
 * `encryptionKey` (ya decodificado de base64 — el caller es dueño de
 * `Buffer.from(env.ENCRYPTION_KEY, 'base64')`, mismo contrato que
 * `AesGcmCryptoService`).
 */
export function deriveBlindIndexKey(encryptionKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      HKDF_HASH,
      encryptionKey,
      HKDF_SALT,
      Buffer.from(BLIND_INDEX_HKDF_INFO),
      BLIND_INDEX_KEY_LENGTH_BYTES,
    ),
  );
}

/**
 * Info fijo de la SEGUNDA clave derivada del mismo `ENCRYPTION_KEY` (US-041):
 * la clave HMAC que firma el link-intent que viaja en `md_oauth.link`
 * (`infrastructure/http/auth/link-intent.ts`).
 *
 * DEBE ser distinto de `BLIND_INDEX_HKDF_INFO` (design §1/Q1a, §2/D-02).
 * Reusar una clave derivada para un segundo propósito criptográfico es
 * exactamente la falla que este `info` existe para impedir: con la misma
 * clave, un blind index de un email cualquiera y un MAC de link-intent son
 * el mismo primitivo y podrían intercambiarse. Ambas claves son `Buffer`s de
 * 32 bytes, estructuralmente indistinguibles a nivel de tipos — por eso la
 * separación se prueba con un spec (`derive-blind-index-key.spec.ts`), no se
 * asume por convención.
 */
export const LINK_INTENT_HKDF_INFO = 'oauth-link-intent-v1';
const LINK_INTENT_KEY_LENGTH_BYTES = 32;

/**
 * Deriva la clave HMAC de 32 bytes para firmar/verificar el link-intent
 * (`link-intent.ts`) a partir del MISMO `encryptionKey` que
 * `deriveBlindIndexKey` — mismo contrato de input, `info` distinto.
 */
export function deriveLinkIntentKey(encryptionKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      HKDF_HASH,
      encryptionKey,
      HKDF_SALT,
      Buffer.from(LINK_INTENT_HKDF_INFO),
      LINK_INTENT_KEY_LENGTH_BYTES,
    ),
  );
}
