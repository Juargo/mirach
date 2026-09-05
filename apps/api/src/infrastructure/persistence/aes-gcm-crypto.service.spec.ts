import { randomBytes } from 'node:crypto';
import { AesGcmCryptoService } from './aes-gcm-crypto.service';

/**
 * Unit tests for AesGcmCryptoService — implementación real de ICryptoService
 * (ADR-013). AES-256-GCM con IV aleatorio de 12 bytes por valor.
 */
describe('AesGcmCryptoService', () => {
  function makeService(): AesGcmCryptoService {
    return new AesGcmCryptoService(randomBytes(32));
  }

  it('roundtrip: decrypt(encrypt(plaintext)) === plaintext', () => {
    const crypto = makeService();
    const plaintext = 'Compra Supermercado Lider';

    const ciphertext = crypto.encrypt(plaintext);

    expect(crypto.decrypt(ciphertext)).toBe(plaintext);
  });

  it('el formato serializado empieza con el prefijo de versión "v1:"', () => {
    const crypto = makeService();

    const ciphertext = crypto.encrypt('Sueldo Empresa');

    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(ciphertext.split(':')).toHaveLength(4);
  });

  it('dos encrypt() del MISMO plaintext producen ciphertext DISTINTO (IV aleatorio), pero ambos decryptan al mismo plaintext', () => {
    const crypto = makeService();
    const plaintext = 'Pago Tarjeta Crédito';

    const a = crypto.encrypt(plaintext);
    const b = crypto.encrypt(plaintext);

    expect(a).not.toBe(b);
    expect(crypto.decrypt(a)).toBe(plaintext);
    expect(crypto.decrypt(b)).toBe(plaintext);
  });

  it('legacy plaintext (sin prefijo "v1:") LANZA en decrypt() — fail-loud, sin passthrough (US-036, migración completa)', () => {
    const crypto = makeService();
    const legacyPlaintext = 'Compra Falabella';

    expect(() => crypto.decrypt(legacyPlaintext)).toThrow();
  });

  it('ciphertext manipulado (auth tag no coincide) LANZA en decrypt', () => {
    const crypto = makeService();
    const ciphertext = crypto.encrypt('Retiro Cajero');
    const parts = ciphertext.split(':');
    // Tamper el auth tag a nivel de byte (no de char base64url): decodifica,
    // invierte el primer byte y recodifica. Flipear un char base64url puede
    // ser un no-op cuando el cambio cae en bits de padding descartados, lo que
    // hacía este test flaky; a nivel de byte el cambio es siempre efectivo.
    const tagBytes = Buffer.from(parts[2], 'base64url');
    tagBytes[0] ^= 0xff;
    const tamperedTag = tagBytes.toString('base64url');
    const tampered = [parts[0], parts[1], tamperedTag, parts[3]].join(':');

    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('ciphertext malformado (formato v1 inválido) LANZA en decrypt', () => {
    const crypto = makeService();

    expect(() => crypto.decrypt('v1:not-valid-base64-segments')).toThrow();
  });

  it('boundary caso aceptado — texto plano legacy que COINCIDE con el prefijo "v1:" y tiene forma de 4 segmentos se enruta a decrypt y LANZA (colisión de prefijo, riesgo de baja severidad documentado en aes-gcm-crypto.service.ts)', () => {
    const crypto = makeService();

    // No es ciphertext real: es texto plano que por coincidencia empieza con
    // "v1:" y tiene 4 segmentos separados por ":" — decrypt() no puede
    // distinguirlo de un ciphertext v1 real, así que lo trata como tal y
    // falla al intentar decodificar/desautenticar los segmentos.
    const legacyPlaintextThatLooksLikeV1 = 'v1:a:b:c';

    expect(() => crypto.decrypt(legacyPlaintextThatLooksLikeV1)).toThrow();
  });

  it('un authTag TRUNCADO es rechazado (guarda del invariante de authTagLength)', () => {
    // No es un test RED-first: Node >=11 ya rechaza los tags truncados por su
    // cuenta, así que esto pasaba antes de fijar `authTagLength: 16` y sigue
    // pasando después. Existe como guarda de regresión — pin del requisito
    // frente a un cambio de default de Node o a un refactor que saque la
    // opción. GCM admite tags de 4..16 bytes; aceptar uno de 4 bajaría la
    // resistencia a falsificación de 2^128 a 2^32.
    const servicio = makeService();
    const cifrado = servicio.encrypt('monto sensible');

    const [prefijo, ivB64, authTagB64, ciphertextB64] = cifrado.split(':');
    const tagTruncado = Buffer.from(authTagB64, 'base64url').subarray(0, 4);
    const conTagCorto = [
      prefijo,
      ivB64,
      tagTruncado.toString('base64url'),
      ciphertextB64,
    ].join(':');

    expect(() => servicio.decrypt(conTagCorto)).toThrow();
  });

  it('string vacío hace roundtrip correctamente', () => {
    const crypto = makeService();

    const ciphertext = crypto.encrypt('');

    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(ciphertext)).toBe('');
  });
});
