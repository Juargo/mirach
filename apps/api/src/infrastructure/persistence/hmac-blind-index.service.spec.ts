import { createHmac } from 'node:crypto';
import { HmacBlindIndexService } from './hmac-blind-index.service';

/**
 * HmacBlindIndexService — unit tests (US-035).
 *
 * Determinismo es la propiedad central: buscarPorEmail() depende de que
 * compute(mismo valor) SIEMPRE produzca el mismo hash, para poder hacer
 * `WHERE emailBlindIndex = ...` — cualquier no-determinismo rompería el
 * login en silencio (nunca matchea).
 */
describe('HmacBlindIndexService', () => {
  const key = Buffer.alloc(32, 9);

  it('es determinístico: el mismo valor con la misma clave siempre produce el mismo hash', () => {
    const svc = new HmacBlindIndexService(key);

    const a = svc.compute('user@example.com');
    const b = svc.compute('user@example.com');

    expect(a).toBe(b);
  });

  it('valores distintos producen hashes distintos', () => {
    const svc = new HmacBlindIndexService(key);

    const a = svc.compute('user-a@example.com');
    const b = svc.compute('user-b@example.com');

    expect(a).not.toBe(b);
  });

  it('la misma entrada con claves distintas produce hashes distintos', () => {
    const otraKey = Buffer.alloc(32, 1);
    const svcA = new HmacBlindIndexService(key);
    const svcB = new HmacBlindIndexService(otraKey);

    expect(svcA.compute('user@example.com')).not.toBe(
      svcB.compute('user@example.com'),
    );
  });

  it('produce un hex de 64 caracteres (HMAC-SHA256)', () => {
    const svc = new HmacBlindIndexService(key);

    const hash = svc.compute('user@example.com');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('vector fijo: clave y valor conocidos siempre producen el mismo hash (pin de regresión)', () => {
    // Clave de 32 bytes fija (Buffer.alloc(32, 9)) + valor fijo — si alguien
    // cambia el algoritmo/encoding de HmacBlindIndexService por accidente,
    // este test lo detecta (aunque los otros tests de "determinismo" sigan
    // pasando entre sí).
    const svc = new HmacBlindIndexService(Buffer.alloc(32, 9));

    const hash = svc.compute('pin@example.com');

    expect(hash).toBe(
      createHmac('sha256', Buffer.alloc(32, 9))
        .update('pin@example.com', 'utf8')
        .digest('hex'),
    );
  });
});
