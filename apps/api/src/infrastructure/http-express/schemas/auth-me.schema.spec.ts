import { authMeResponseSchema } from './auth-me.schema';

/**
 * `authMeResponseSchema` — Phase 10.2 rollout of the openapi-contract-express
 * change (GET /api/auth/me, AUTH-09).
 *
 * There is no dedicated DTO mapper for this endpoint — `registrarAuthMe`
 * (`routes/auth.routes.ts`) builds the JSON object inline from
 * `IdentidadUsuario`. So the sync guarantee (spec req #8) is an HTTP-level
 * supertest assertion against the real handler output (see `app.auth.spec.ts`
 * — "el body 200 real cumple authMeResponseSchema"), not a unit-level
 * fixture-through-mapper test like `resumen.schema.spec.ts`. This file only
 * covers the schema's structural shape in isolation.
 */
describe('authMeResponseSchema', () => {
  it('parses a real (non-demo) user shape', () => {
    const parsed = authMeResponseSchema.parse({
      userId: 'u1',
      esDemo: false,
      email: 'a@b.cl',
    });

    expect(parsed).toEqual({ userId: 'u1', esDemo: false, email: 'a@b.cl' });
  });

  it('parses a demo user shape with email: null', () => {
    const parsed = authMeResponseSchema.parse({
      userId: 'demo-1',
      esDemo: true,
      email: null,
    });

    expect(parsed.email).toBeNull();
  });

  it(
    'does NOT reject a non-demo user with email: null — transport shape only. ' +
      'The cross-field invariant (esDemo=false requires a non-null email) is a ' +
      'DOMAIN rule (buscarIdentidad), not enforced at this boundary schema.',
    () => {
      const result = authMeResponseSchema.safeParse({
        userId: 'u1',
        esDemo: false,
        email: null,
      });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a payload missing esDemo', () => {
    expect(() =>
      authMeResponseSchema.parse({ userId: 'u1', email: 'a@b.cl' }),
    ).toThrow();
  });

  it('rejects esDemo as a non-boolean', () => {
    expect(() =>
      authMeResponseSchema.parse({
        userId: 'u1',
        esDemo: 'false',
        email: null,
      }),
    ).toThrow();
  });

  it('rejects email as a non-string, non-null value', () => {
    expect(() =>
      authMeResponseSchema.parse({ userId: 'u1', esDemo: false, email: 42 }),
    ).toThrow();
  });
});
