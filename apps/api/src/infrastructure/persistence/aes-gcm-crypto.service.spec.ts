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

  it('legacy plaintext (sin prefijo "v1:") pasa por decrypt() SIN cambios — migración zero-downtime', () => {
    const crypto = makeService();
    const legacyPlaintext = 'Compra Falabella';

    expect(crypto.decrypt(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it('ciphertext manipulado (auth tag no coincide) LANZA en decrypt', () => {
    const crypto = makeService();
    const ciphertext = crypto.encrypt('Retiro Cajero');
    const parts = ciphertext.split(':');
    // Tamper el ciphertext (último segmento) cambiando un char.
    const tamperedLastSegment =
      parts[3].slice(0, -1) + (parts[3].at(-1) === 'A' ? 'B' : 'A');
    const tampered = [parts[0], parts[1], parts[2], tamperedLastSegment].join(
      ':',
    );

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

  it('string vacío hace roundtrip correctamente', () => {
    const crypto = makeService();

    const ciphertext = crypto.encrypt('');

    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(ciphertext)).toBe('');
  });
});
