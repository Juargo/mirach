import { hkdfSync } from 'node:crypto';

/**
 * derive-blind-index-key — deriva, vía HKDF, la clave HMAC de
 * `HmacBlindIndexService` a partir del MISMO `ENCRYPTION_KEY` de AES-256
 * usado por `AesGcmCryptoService` (ADR-013) — sin introducir un env var
 * nuevo (US-035, Slice 1). Vive en el composition root (no en el adapter,
 * ver hmac-blind-index.service.ts) porque construir/derivar claves es
 * responsabilidad del ensamblado, no del servicio que las usa.
 *
 * `container.ts`, `prisma/seed.ts` y `prisma/backfill-email-blind-index.ts`
 * DEBEN llamar a este mismo helper con el mismo `ENCRYPTION_KEY` — si
 * cualquiera de los tres derivara la clave de otra forma, el blind index que
 * escribe uno no matchearía el que consulta otro (login roto en silencio).
 * Single-sourced a propósito (DRY): salt/info/length/hash son constantes acá,
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
