import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ICryptoService } from '../../application/ports/crypto-service.port';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const VERSION_PREFIX = 'v1';

/**
 * True si `value` tiene el formato ESTRUCTURAL de un ciphertext v1
 * (prefijo `v1:` + exactamente 4 segmentos separados por `:`). NO garantiza
 * que descifre correctamente bajo la clave actual (eso solo lo confirma
 * `decrypt()` en tiempo real, vía authTag) — es la misma validación
 * estructural que `decrypt()` usa para distinguir "esto parece un
 * ciphertext v1" de "esto es texto plano legacy". Exportada para que otros
 * consumidores (p. ej. el backfill de ADR-013, ver
 * prisma/backfill-descripcion-encryption.ts) puedan clasificar filas sin
 * reimplementar el parseo — DRY, fuente única del formato serializado.
 */
export function tieneFormatoV1(value: string): boolean {
  return (
    value.startsWith(`${VERSION_PREFIX}:`) && value.split(':').length === 4
  );
}

/**
 * AesGcmCryptoService — implementación real de ICryptoService (ADR-013).
 *
 * AES-256-GCM con IV aleatorio de 12 bytes por valor cifrado (nunca
 * reutilizado — la seguridad de GCM depende de eso). Formato serializado:
 * `v1:<iv base64url>:<authTag base64url>:<ciphertext base64url>`.
 *
 * `decrypt()` es fail-loud (US-036): el backfill de ADR-013 ya migró todas
 * las filas de `Transaccion.descripcion` a ciphertext v1, así que la ventana
 * de migración terminó. Cualquier valor que no tenga el formato estructural
 * `v1:` (ver `tieneFormatoV1()`) LANZA en vez de devolverse como-is — el
 * passthrough de texto plano legacy que existía durante la migración se
 * eliminó a propósito: dejarlo vivo era un riesgo silencioso (una fila que
 * por algún motivo no se cifró se serviría en claro sin que nada lo
 * detectara).
 *
 * La clave de 32 bytes se recibe ya decodificada — este adapter es "tonto" a
 * propósito: decodificar/validar el base64 del env es responsabilidad del
 * composition root (ver crear-process-ingesta.ts / container.ts), no de este
 * adapter.
 */
export class AesGcmCryptoService implements ICryptoService {
  constructor(private readonly key: Buffer) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      VERSION_PREFIX,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string): string {
    // Fail-loud (US-036): cualquier valor sin el formato estructural v1
    // (prefijo `v1:` + 4 segmentos) LANZA — no hay passthrough de texto
    // plano legacy, ver docstring de la clase.
    if (!tieneFormatoV1(value)) {
      throw new Error('AesGcmCryptoService: formato v1 malformado.');
    }

    const [, ivB64, authTagB64, ciphertextB64] = value.split(':');
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    // `authTagLength` explícito: GCM admite tags de 4..16 bytes, y un tag
    // truncado baja la resistencia a falsificación de 2^128 a 2^32. Node >=11
    // ya rechaza los truncados por su cuenta (verificado: un tag de 8 o 4
    // bytes lanza ERR_CRYPTO_INVALID_AUTH_TAG sin esta opción), así que esto
    // NO corrige una vulnerabilidad viva — hace explícito el invariante para
    // que no dependa del default de la versión de Node, y le saca a semgrep
    // el hallazgo `gcm-no-tag-length` (ADR-021, capa SAST).
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
