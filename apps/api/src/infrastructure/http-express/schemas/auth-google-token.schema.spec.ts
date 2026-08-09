import { authGoogleTokenRequestSchema } from './auth-google-token.schema';

/**
 * `authGoogleTokenRequestSchema` — B1.2/B1.3 (AUTH-19, AUTH-23 regression
 * pin). CONTRACT-ONLY: documents the shape, never `.safeParse()`'d at the
 * route (route casts `req.body` by hand, mirroring `/auth/login`).
 */
describe('authGoogleTokenRequestSchema', () => {
  it('accepts a well-formed { idToken } payload', () => {
    const result = authGoogleTokenRequestSchema.safeParse({
      idToken: 'a.b.c',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing idToken', () => {
    const result = authGoogleTokenRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it(
    'AUTH-23 regression pin: an unexpected nonce key is accepted and ' +
      'silently stripped, never rejected — no nonce field exists in the contract',
    () => {
      const result = authGoogleTokenRequestSchema.safeParse({
        idToken: 'a.b.c',
        nonce: 'should-be-ignored',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ idToken: 'a.b.c' });
      }
    },
  );
});
