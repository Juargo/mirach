import type { Request } from 'express';
import { extractToken } from './extraer-token';

/**
 * Pure helper — no session/guard involved. Isolates the cookie-vs-Bearer
 * precedence rule (AUTH-05) so it's testable without a live session.
 */
function requestMock(opts: {
  cookie?: string;
  authorization?: string;
}): Request {
  return {
    headers: {
      cookie: opts.cookie,
      authorization: opts.authorization,
    },
  } as unknown as Request;
}

describe('extractToken', () => {
  it('cookie-only → retorna el token de la cookie md_session', () => {
    const request = requestMock({ cookie: 'md_session=token-abc' });

    expect(extractToken(request)).toBe('token-abc');
  });

  it('Bearer-only → retorna el token del header Authorization', () => {
    const request = requestMock({ authorization: 'Bearer token-xyz' });

    expect(extractToken(request)).toBe('token-xyz');
  });

  it('ambos presentes → retorna el token de la cookie (precedencia)', () => {
    const request = requestMock({
      cookie: 'md_session=token-cookie',
      authorization: 'Bearer token-bearer-garbage',
    });

    expect(extractToken(request)).toBe('token-cookie');
  });

  it('Authorization malformado (sin esquema Bearer) → undefined', () => {
    const request = requestMock({ authorization: 'Basic dXNlcjpwYXNz' });

    expect(extractToken(request)).toBeUndefined();
  });

  it('ninguno presente → undefined', () => {
    const request = requestMock({});

    expect(extractToken(request)).toBeUndefined();
  });

  it('cookie header con múltiples cookies → extrae solo md_session', () => {
    const request = requestMock({
      cookie: 'otra=valor; md_session=token-entre-otras; masOtra=x',
    });

    expect(extractToken(request)).toBe('token-entre-otras');
  });

  it('esquema Bearer es case-insensitive', () => {
    const request = requestMock({ authorization: 'bearer token-lower' });

    expect(extractToken(request)).toBe('token-lower');
  });

  it('cookie header presente pero sin md_session → cae a Bearer', () => {
    const request = requestMock({
      cookie: 'otra=valor',
      authorization: 'Bearer token-fallback',
    });

    expect(extractToken(request)).toBe('token-fallback');
  });
});
