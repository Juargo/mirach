import { describe, it, expect } from 'vitest';
import { extractLoginToken } from './extract-login-token';

describe('extractLoginToken — parses the DAST login pre-step response body', () => {
  it('returns the token when the body matches POST /api/auth/login shape', () => {
    const body = {
      token: 'abc123',
      userId: 'user-1',
      expiresAt: '2026-08-03T00:00:00.000Z',
    };

    expect(extractLoginToken(body)).toBe('abc123');
  });

  it('throws when the body has no token field', () => {
    const body = { userId: 'user-1', expiresAt: '2026-08-03T00:00:00.000Z' };

    expect(() => extractLoginToken(body)).toThrow(/missing.*token/i);
  });

  it('throws when token is present but not a string', () => {
    const body = { token: 12345 };

    expect(() => extractLoginToken(body)).toThrow(/missing.*token/i);
  });

  it('throws when the body is not an object (e.g. a login error response)', () => {
    expect(() => extractLoginToken(null)).toThrow(/missing.*token/i);
    expect(() => extractLoginToken(undefined)).toThrow(/missing.*token/i);
    expect(() => extractLoginToken('unauthorized')).toThrow(/missing.*token/i);
    expect(() => extractLoginToken(42)).toThrow(/missing.*token/i);
  });

  it('throws when token is an empty string (rejects, does not silently accept)', () => {
    expect(() => extractLoginToken({ token: '' })).toThrow(/missing.*token/i);
  });
});
