import {
  authLoginRequestSchema,
  authLoginResponseSchema,
} from './auth-login.schema';

/**
 * `authLoginRequestSchema` / `authLoginResponseSchema` — Phase 10.2b rollout
 * of the openapi-contract-express change (POST /api/auth/login).
 *
 * CONTRACT-ONLY (design decision): this schema documents the transport shape
 * for the OpenAPI doc; it is NEVER `.safeParse()`'d at the route.
 * `registrarAuthPublic` (`routes/auth.routes.ts`) still casts `req.body` by
 * hand, exactly as before — auth is the most sensitive endpoint group, so
 * route logic is deliberately preserved unchanged.
 */
describe('authLoginRequestSchema', () => {
  it('accepts a well-formed email/password payload', () => {
    const result = authLoginRequestSchema.safeParse({
      email: 'a@b.cl',
      password: 'secreta',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing password', () => {
    const result = authLoginRequestSchema.safeParse({ email: 'a@b.cl' });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing email', () => {
    const result = authLoginRequestSchema.safeParse({ password: 'secreta' });
    expect(result.success).toBe(false);
  });
});

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): matched
 * against the literal object built inline in `registrarAuthPublic` — there
 * is no dedicated DTO mapper for login. `expiresAt` is `.toISOString()`'d at
 * the route, so the transport shape is a string, never a `Date`.
 */
describe('authLoginResponseSchema (sync guarantee)', () => {
  it('parses the real route output shape (token, userId, expiresAt as ISO string)', () => {
    const parsed = authLoginResponseSchema.parse({
      token: 'tok-1',
      userId: 'user-1',
      expiresAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
    });

    expect(parsed).toEqual({
      token: 'tok-1',
      userId: 'user-1',
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('rejects expiresAt as a Date object (never serialized as-is)', () => {
    expect(() =>
      authLoginResponseSchema.parse({
        token: 'tok-1',
        userId: 'user-1',
        expiresAt: new Date(),
      }),
    ).toThrow();
  });

  it('rejects a payload missing token', () => {
    expect(() =>
      authLoginResponseSchema.parse({
        userId: 'user-1',
        expiresAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
