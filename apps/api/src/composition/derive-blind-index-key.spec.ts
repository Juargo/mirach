import { hkdfSync } from 'node:crypto';
import {
  deriveBlindIndexKey,
  deriveLinkIntentKey,
  BLIND_INDEX_HKDF_INFO,
  LINK_INTENT_HKDF_INFO,
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

/**
 * deriveLinkIntentKey — unit tests (US-041, binding item #1).
 *
 * La prueba de separación de propósito (design §1/Q1a, §2/D-02) es el CASO
 * REAL: si alguien copy-pastea `deriveBlindIndexKey` y olvida cambiar el
 * `info`, esta clave colisionaría con la del blind index — mismo primitivo,
 * dos propósitos criptográficos distintos. `LINK_INTENT_HKDF_INFO !==
 * BLIND_INDEX_HKDF_INFO` es el tripwire barato que además documenta la
 * intención.
 */
describe('deriveLinkIntentKey', () => {
  const encryptionKey = Buffer.alloc(32, 7);

  it('es determinístico: la misma ENCRYPTION_KEY siempre deriva la misma clave', () => {
    const a = deriveLinkIntentKey(encryptionKey);
    const b = deriveLinkIntentKey(encryptionKey);

    expect(a.equals(b)).toBe(true);
  });

  it('ENCRYPTION_KEY distintas derivan claves distintas', () => {
    const otra = Buffer.alloc(32, 1);

    const a = deriveLinkIntentKey(encryptionKey);
    const b = deriveLinkIntentKey(otra);

    expect(a.equals(b)).toBe(false);
  });

  it('deriva exactamente 32 bytes', () => {
    expect(deriveLinkIntentKey(encryptionKey).length).toBe(32);
  });

  it('matchea el vector HKDF construido a mano con salt vacío + info fijo + sha256 (pin de parámetros)', () => {
    const expected = Buffer.from(
      hkdfSync(
        'sha256',
        encryptionKey,
        Buffer.alloc(0),
        Buffer.from(LINK_INTENT_HKDF_INFO),
        32,
      ),
    );

    expect(deriveLinkIntentKey(encryptionKey).equals(expected)).toBe(true);
  });

  it('LINK_INTENT_HKDF_INFO es exactamente "oauth-link-intent-v1" (pin del namespacing)', () => {
    expect(LINK_INTENT_HKDF_INFO).toBe('oauth-link-intent-v1');
  });

  it('PROOF DE SEPARACIÓN DE PROPÓSITO (binding item #1, design §2/D-02): para la MISMA ENCRYPTION_KEY, deriveLinkIntentKey !== deriveBlindIndexKey — este es el test real, no el tripwire', () => {
    expect(
      deriveLinkIntentKey(encryptionKey).equals(
        deriveBlindIndexKey(encryptionKey),
      ),
    ).toBe(false);
  });

  it('el tripwire barato: LINK_INTENT_HKDF_INFO !== BLIND_INDEX_HKDF_INFO', () => {
    expect(LINK_INTENT_HKDF_INFO).not.toBe(BLIND_INDEX_HKDF_INFO);
  });
});
