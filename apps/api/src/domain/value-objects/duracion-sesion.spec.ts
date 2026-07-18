import {
  TTL_SESION_MS,
  calcularExpiracion,
  estaExpirada,
} from './duracion-sesion';

describe('duracion-sesion', () => {
  describe('TTL_SESION_MS', () => {
    it('equals exactly 7 days in milliseconds', () => {
      expect(TTL_SESION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('calcularExpiracion(ahora)', () => {
    it('returns ahora + 7 days, exactly', () => {
      const ahora = new Date('2026-07-15T12:00:00.000Z');

      const expiracion = calcularExpiracion(ahora);

      expect(expiracion.toISOString()).toBe('2026-07-22T12:00:00.000Z');
    });

    it('is pure — same input always produces the same output, no Date.now() drift', () => {
      const ahora = new Date('2026-01-01T00:00:00.000Z');

      const first = calcularExpiracion(ahora);
      const second = calcularExpiracion(ahora);

      expect(first.getTime()).toBe(second.getTime());
    });

    it('crosses a month/year boundary correctly', () => {
      const ahora = new Date('2026-12-28T00:00:00.000Z');

      const expiracion = calcularExpiracion(ahora);

      expect(expiracion.toISOString()).toBe('2027-01-04T00:00:00.000Z');
    });
  });

  describe('estaExpirada(expiresAt, ahora)', () => {
    it('false when ahora is strictly before expiresAt', () => {
      const expiresAt = new Date('2026-07-22T12:00:00.000Z');
      const ahora = new Date('2026-07-22T11:59:59.999Z');

      expect(estaExpirada(expiresAt, ahora)).toBe(false);
    });

    it('true when ahora is exactly at expiresAt (boundary is inclusive of expiry)', () => {
      const expiresAt = new Date('2026-07-22T12:00:00.000Z');
      const ahora = new Date('2026-07-22T12:00:00.000Z');

      expect(estaExpirada(expiresAt, ahora)).toBe(true);
    });

    it('true when ahora is after expiresAt', () => {
      const expiresAt = new Date('2026-07-22T12:00:00.000Z');
      const ahora = new Date('2026-07-23T00:00:00.000Z');

      expect(estaExpirada(expiresAt, ahora)).toBe(true);
    });
  });
});
