import { hkdfSync } from 'node:crypto';
import {
  deriveBlindIndexKey,
  BLIND_INDEX_HKDF_INFO,
} from './derive-blind-index-key';

/**
 * deriveBlindIndexKey — unit tests (US-035).
 *
 * Pin de regresión de los parámetros HKDF (salt vacío, info
 * 'blind-index-v1', length 32, hash sha256): container.ts, prisma/seed.ts y
 * prisma/backfill-email-blind-index.ts DEBEN derivar la MISMA clave del
 * MISMO ENCRYPTION_KEY — si estos parámetros cambiaran silenciosamente en un
 * refactor, el blind index escrito por uno dejaría de matchear el que
 * consulta otro (login roto sin que ningún test de comportamiento aislado lo
 * note). Este test fija los parámetros explícitamente, sin pasar por el
 * helper, como referencia independiente.
 */
describe('deriveBlindIndexKey', () => {
  const encryptionKey = Buffer.alloc(32, 7);

  it('es determinístico: la misma ENCRYPTION_KEY siempre deriva la misma clave', () => {
    const a = deriveBlindIndexKey(encryptionKey);
    const b = deriveBlindIndexKey(encryptionKey);

    expect(a.equals(b)).toBe(true);
  });

  it('ENCRYPTION_KEY distintas derivan claves distintas', () => {
    const otra = Buffer.alloc(32, 1);

    const a = deriveBlindIndexKey(encryptionKey);
    const b = deriveBlindIndexKey(otra);

    expect(a.equals(b)).toBe(false);
  });

  it('deriva exactamente 32 bytes', () => {
    expect(deriveBlindIndexKey(encryptionKey).length).toBe(32);
  });

  it('matchea el vector HKDF construido a mano con salt vacío + info fijo + sha256 (pin de parámetros)', () => {
    const expected = Buffer.from(
      hkdfSync(
        'sha256',
        encryptionKey,
        Buffer.alloc(0),
        Buffer.from(BLIND_INDEX_HKDF_INFO),
        32,
      ),
    );

    expect(deriveBlindIndexKey(encryptionKey).equals(expected)).toBe(true);
  });

  it('BLIND_INDEX_HKDF_INFO es exactamente "blind-index-v1" (pin del namespacing)', () => {
    expect(BLIND_INDEX_HKDF_INFO).toBe('blind-index-v1');
  });
});
