import {
  OAUTH_COOKIE_NAME,
  serializeOauthCookie,
  parseOauthCookie,
  clearOauthCookie,
} from './oauth-transient-cookie';

/**
 * oauth-transient-cookie — `md_oauth` (design §3, C2.1/C2.2). Pure functions,
 * same style as `cookie.ts`/`extraer-token.ts`: no I/O, exercised without a
 * real Express request/response.
 */
describe('oauth-transient-cookie', () => {
  const PAYLOAD = {
    state: 'state-abc',
    nonce: 'nonce-def',
    codeVerifier: 'verifier-ghi',
  };

  describe('serializeOauthCookie', () => {
    it('produce el string exacto de atributos (design §3 tabla)', () => {
      const header = serializeOauthCookie(PAYLOAD, false);

      expect(header).toMatch(new RegExp(`^${OAUTH_COOKIE_NAME}=`));
      expect(header).toContain('Max-Age=600');
      expect(header).toContain('Path=/api/auth/google');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).not.toContain('Secure');
      // Sin Domain= — host-only, misma postura que md_session.
      expect(header).not.toMatch(/Domain=/);
    });

    it('agrega Secure cuando cookieSecure es true', () => {
      const header = serializeOauthCookie(PAYLOAD, true);
      expect(header).toContain('Secure');
    });

    it('el valor es base64url(JSON.stringify(payload)) — no JSON crudo en la cookie', () => {
      const header = serializeOauthCookie(PAYLOAD, false);
      const valor = header.split(';')[0].split('=')[1];

      // base64url no usa +, /, ni = de padding.
      expect(valor).not.toMatch(/[+/=]/);
      expect(
        JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')),
      ).toEqual(PAYLOAD);
    });
  });

  describe('parseOauthCookie — round-trip', () => {
    it('parsea de vuelta exactamente lo que serializeOauthCookie produjo', () => {
      const header = serializeOauthCookie(PAYLOAD, false);
      const valor = header.split(';')[0].split('=')[1];

      const parsed = parseOauthCookie(`${OAUTH_COOKIE_NAME}=${valor}`);

      expect(parsed).toEqual(PAYLOAD);
    });

    it('encuentra la cookie entre otras cookies del header', () => {
      const header = serializeOauthCookie(PAYLOAD, false);
      const valor = header.split(';')[0].split('=')[1];

      const parsed = parseOauthCookie(
        `otra=1; ${OAUTH_COOKIE_NAME}=${valor}; md_session=xyz`,
      );

      expect(parsed).toEqual(PAYLOAD);
    });

    it('undefined cuando el header de cookies está ausente', () => {
      expect(parseOauthCookie(undefined)).toBeUndefined();
    });

    it('undefined cuando la cookie md_oauth no está presente', () => {
      expect(parseOauthCookie('otra=1; md_session=xyz')).toBeUndefined();
    });

    it('undefined cuando el valor está vacío', () => {
      expect(parseOauthCookie(`${OAUTH_COOKIE_NAME}=`)).toBeUndefined();
    });

    it('undefined cuando el base64url es inválido/truncado', () => {
      expect(
        parseOauthCookie(`${OAUTH_COOKIE_NAME}=not-valid-base64url-json!!!`),
      ).toBeUndefined();
    });

    it('undefined cuando el JSON decodifica pero no tiene la forma esperada', () => {
      const valor = Buffer.from(
        JSON.stringify({ foo: 'bar' }),
        'utf8',
      ).toString('base64url');
      expect(parseOauthCookie(`${OAUTH_COOKIE_NAME}=${valor}`)).toBeUndefined();
    });

    it('undefined cuando el JSON decodifica a un array u otro tipo no-objeto', () => {
      const valor = Buffer.from(
        JSON.stringify(['no', 'un', 'objeto']),
        'utf8',
      ).toString('base64url');
      expect(parseOauthCookie(`${OAUTH_COOKIE_NAME}=${valor}`)).toBeUndefined();
    });
  });

  describe('clearOauthCookie', () => {
    it('Max-Age=0 con los mismos atributos de path/samesite/httponly', () => {
      const header = clearOauthCookie(false);

      expect(header).toMatch(new RegExp(`^${OAUTH_COOKIE_NAME}=;`));
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('Path=/api/auth/google');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
    });

    it('agrega Secure cuando cookieSecure es true', () => {
      expect(clearOauthCookie(true)).toContain('Secure');
    });
  });
});
