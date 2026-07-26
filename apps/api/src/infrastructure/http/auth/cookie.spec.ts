import { serializeSessionCookie, clearSessionCookie } from './cookie';

/**
 * ADR-029: `secure` se recibe como parámetro (parameter-threading, decisión
 * KISS/YAGNI de design.md — NO una clase inyectada), no se lee de
 * `process.env` dentro de este módulo. El call site (auth.routes.ts) recibe
 * `cookieSecure` de `AuthPublicDeps`, derivado una sola vez en app.ts a partir
 * de `env`. `shouldBeSecure()` se eliminó.
 */
describe('cookie', () => {
  describe('serializeSessionCookie()', () => {
    it('setea nombre md_session, HttpOnly, SameSite=Strict, Path=/, sin Domain=', () => {
      const ahora = new Date('2026-07-18T00:00:00.000Z');
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');

      const cookie = serializeSessionCookie('token-abc', expiresAt, false, ahora);

      expect(cookie).toContain('md_session=token-abc');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    });

    it('Max-Age refleja los segundos hasta expiresAt (7 días → 604800)', () => {
      const ahora = new Date('2026-07-18T00:00:00.000Z');
      const expiresAt = new Date('2026-07-25T00:00:00.000Z'); // +7d exacto

      const cookie = serializeSessionCookie('token-abc', expiresAt, false, ahora);

      expect(cookie).toContain('Max-Age=604800');
    });

    it('sin Secure cuando secure=false', () => {
      const cookie = serializeSessionCookie(
        'token-abc',
        new Date('2026-07-25T00:00:00.000Z'),
        false,
        new Date('2026-07-18T00:00:00.000Z'),
      );

      expect(cookie).not.toContain('Secure');
    });

    it('con Secure cuando secure=true', () => {
      const cookie = serializeSessionCookie(
        'token-abc',
        new Date('2026-07-25T00:00:00.000Z'),
        true,
        new Date('2026-07-18T00:00:00.000Z'),
      );

      expect(cookie).toContain('Secure');
    });
  });

  describe('clearSessionCookie()', () => {
    it('mismos atributos con Max-Age=0 (secure=false)', () => {
      const cookie = clearSessionCookie(false);

      expect(cookie).toContain('md_session=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Secure');
    });

    it('agrega Secure cuando secure=true', () => {
      const cookie = clearSessionCookie(true);

      expect(cookie).toContain('Secure');
    });
  });
});
