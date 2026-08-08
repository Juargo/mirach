import {
  redactSensitiveQueryParams,
  redactSensitiveQueryObject,
} from './redact-sensitive-query-params';

/**
 * redactSensitiveQueryParams — design §6.3(a). `pino-http`'s default `req`
 * serializer logs `url` with its full query string, so
 * `?code=...&state=...` on the Google callback would land verbatim in
 * production logs (AUTH-18). Wired as `serializers.req` in
 * `createRequestLoggerMiddleware` (C1.10).
 */
describe('redactSensitiveQueryParams (design §6.3(a))', () => {
  const SENSIBLES = [
    'code',
    'state',
    'id_token',
    'access_token',
    'refresh_token',
    'token',
    'code_verifier',
  ];

  it.each(SENSIBLES)('redacta el valor de "%s"', (param) => {
    const url = `/api/auth/google/callback?${param}=un-valor-secreto-cualquiera`;

    const resultado = redactSensitiveQueryParams(url);

    expect(resultado).not.toContain('un-valor-secreto-cualquiera');
    expect(resultado).toContain(`${param}=%5BREDACTED%5D`);
  });

  it('redacta múltiples params sensibles a la vez, preservando el orden', () => {
    const url = '/api/auth/google/callback?code=abc123&state=xyz789';

    const resultado = redactSensitiveQueryParams(url);

    expect(resultado).toBe(
      '/api/auth/google/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D',
    );
  });

  it('NO toca params no sensibles (periodo, anio)', () => {
    const url = '/api/resumen?periodo=2026-07&anio=2026';

    const resultado = redactSensitiveQueryParams(url);

    expect(resultado).toBe('/api/resumen?periodo=2026-07&anio=2026');
  });

  it('deja un param sensible junto a uno no sensible: solo redacta el sensible', () => {
    const url = '/api/auth/google/callback?state=secreto&periodo=2026-07';

    const resultado = redactSensitiveQueryParams(url);

    expect(resultado).toContain('state=%5BREDACTED%5D');
    expect(resultado).toContain('periodo=2026-07');
    expect(resultado).not.toContain('secreto');
  });

  it('una URL sin query string pasa sin cambios', () => {
    const url = '/api/auth/google';

    expect(redactSensitiveQueryParams(url)).toBe('/api/auth/google');
  });

  it('un query string vacío (solo "?") pasa sin cambios', () => {
    const url = '/api/resumen?';

    expect(redactSensitiveQueryParams(url)).toBe('/api/resumen?');
  });

  it('una URL malformada no lanza — retorna el input sin tocar', () => {
    const url = '/api/x?state=\x00malformado%';

    expect(() => redactSensitiveQueryParams(url)).not.toThrow();
  });

  it('preserva el pathname exacto', () => {
    const url = '/api/auth/google/callback?state=abc';

    const resultado = redactSensitiveQueryParams(url);

    expect(resultado.startsWith('/api/auth/google/callback?')).toBe(true);
  });
});

/**
 * redactSensitiveQueryObject — el mismo criterio, aplicado al objeto
 * `req.query` YA PARSEADO por Express, que `pino-http`'s default `req`
 * serializer emite como un campo SEPARADO de `url` (segundo vector de fuga,
 * ver request-logger.middleware.spec.ts).
 */
describe('redactSensitiveQueryObject', () => {
  it('redacta code/state en el objeto query', () => {
    const resultado = redactSensitiveQueryObject({
      code: 'secreto-code',
      state: 'secreto-state',
    });

    expect(resultado).toEqual({
      code: '[REDACTED]',
      state: '[REDACTED]',
    });
  });

  it('no toca claves no sensibles', () => {
    const resultado = redactSensitiveQueryObject({
      periodo: '2026-07',
      anio: '2026',
    });

    expect(resultado).toEqual({ periodo: '2026-07', anio: '2026' });
  });

  it('un objeto vacío pasa sin cambios', () => {
    expect(redactSensitiveQueryObject({})).toEqual({});
  });

  it('no muta el objeto original', () => {
    const original = { code: 'secreto' };

    redactSensitiveQueryObject(original);

    expect(original).toEqual({ code: 'secreto' });
  });
});
