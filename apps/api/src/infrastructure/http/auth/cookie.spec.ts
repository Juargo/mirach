import { serializeSessionCookie, clearSessionCookie } from './cookie';

describe('cookie', () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  describe('serializeSessionCookie()', () => {
    it('setea nombre md_session, HttpOnly, SameSite=Strict, Path=/, sin Domain=', () => {
      delete process.env.NODE_ENV;
      delete process.env.COOKIE_SECURE;
      const ahora = new Date('2026-07-18T00:00:00.000Z');
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');

      const cookie = serializeSessionCookie('token-abc', expiresAt, ahora);

      expect(cookie).toContain('md_session=token-abc');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    });

    it('Max-Age refleja los segundos hasta expiresAt (7 días → 604800)', () => {
      const ahora = new Date('2026-07-18T00:00:00.000Z');
      const expiresAt = new Date('2026-07-25T00:00:00.000Z'); // +7d exacto

      const cookie = serializeSessionCookie('token-abc', expiresAt, ahora);

      expect(cookie).toContain('Max-Age=604800');
    });

    it('sin Secure cuando NODE_ENV no es production y COOKIE_SECURE no es true', () => {
      delete process.env.NODE_ENV;
      delete process.env.COOKIE_SECURE;
      const cookie = serializeSessionCookie(
        'token-abc',
        new Date('2026-07-25T00:00:00.000Z'),
        new Date('2026-07-18T00:00:00.000Z'),
      );

      expect(cookie).not.toContain('Secure');
    });

    it('con Secure cuando NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      const cookie = serializeSessionCookie(
        'token-abc',
        new Date('2026-07-25T00:00:00.000Z'),
        new Date('2026-07-18T00:00:00.000Z'),
      );

      expect(cookie).toContain('Secure');
    });

    it('con Secure cuando COOKIE_SECURE=true (aunque NODE_ENV no sea production)', () => {
      delete process.env.NODE_ENV;
      process.env.COOKIE_SECURE = 'true';
      const cookie = serializeSessionCookie(
        'token-abc',
        new Date('2026-07-25T00:00:00.000Z'),
        new Date('2026-07-18T00:00:00.000Z'),
      );

      expect(cookie).toContain('Secure');
    });
  });

  describe('clearSessionCookie()', () => {
    it('mismos atributos con Max-Age=0', () => {
      const cookie = clearSessionCookie();

      expect(cookie).toContain('md_session=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
    });
  });
});
