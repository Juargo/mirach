import { createHmac } from 'node:crypto';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';

const HMAC_ALGORITHM = 'sha256';

/**
 * HmacBlindIndexService — implementación real de IBlindIndexService (US-035).
 *
 * HMAC-SHA256 determinístico: mismo `value` + misma clave → siempre el mismo
 * hex de salida (a diferencia de `AesGcmCryptoService`, que es
 * intencionalmente no-determinístico vía IV aleatorio). Esa propiedad es
 * justo lo que habilita `WHERE emailBlindIndex = <hash>` en
 * `PrismaUserCredentialRepository.buscarPorEmail`.
 *
 * La clave de 32 bytes se recibe ya derivada (HKDF sobre ENCRYPTION_KEY) —
 * este adapter es "tonto" a propósito, igual que `AesGcmCryptoService`: la
 * derivación vive en el composition root (ver
 * `composition/derive-blind-index-key.ts`), no acá.
 */
export class HmacBlindIndexService implements IBlindIndexService {
  constructor(private readonly key: Buffer) {}

  compute(value: string): string {
    return createHmac(HMAC_ALGORITHM, this.key)
      .update(value, 'utf8')
      .digest('hex');
  }
}
