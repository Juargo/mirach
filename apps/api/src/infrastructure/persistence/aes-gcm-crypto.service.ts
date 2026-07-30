import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ICryptoService } from '../../application/ports/crypto-service.port';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
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
 * `decrypt()` hace passthrough de texto plano LEGACY (cualquier valor sin el
 * prefijo `v1:`) — esto es intencional, no un bug: permite migrar la columna
 * `Transaccion.descripcion` sin downtime (filas viejas en texto plano
 * conviven con filas nuevas cifradas hasta correr el backfill) y hace que el
 * backfill sea idempotente (reintentarlo sobre una fila ya cifrada no la
 * vuelve a tocar porque el backfill primero decrypta — ver diseño ADR-013,
 * el script de backfill queda fuera de este cambio).
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
    if (!value.startsWith(`${VERSION_PREFIX}:`)) {
      // Legacy plaintext passthrough — ver docstring de la clase.
      return value;
    }

    // Riesgo de colisión de prefijo ACEPTADO (baja severidad, solo durante
    // la ventana de migración): un texto plano legacy que por coincidencia
    // empezara con "v1:" y tuviera 4 segmentos separados por ":" se
    // enrutaría acá abajo y LANZARÍA en vez de hacer passthrough — decrypt()
    // no puede distinguir esa coincidencia de un ciphertext v1 real. Texto
    // de cartola bancaria con esa forma exacta es muy improbable, y el
    // backfill de ADR-013 (ver prisma/backfill-descripcion-encryption.ts)
    // clasifica esas filas como "sospechosas" en vez de cifrarlas o
    // saltarlas en silencio, para que un humano las revise. Ver el test
    // "boundary caso aceptado" en aes-gcm-crypto.service.spec.ts.

    if (!tieneFormatoV1(value)) {
      throw new Error('AesGcmCryptoService: formato v1 malformado.');
    }

    const [, ivB64, authTagB64, ciphertextB64] = value.split(':');
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
