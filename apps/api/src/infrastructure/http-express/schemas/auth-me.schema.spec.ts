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
  it('parses a user shape', () => {
    const parsed = authMeResponseSchema.parse({
      userId: 'u1',
      nombre: 'Jorge',
      email: 'a@b.cl',
      googleVinculado: false,
    });

    expect(parsed).toEqual({
      userId: 'u1',
      nombre: 'Jorge',
      email: 'a@b.cl',
      googleVinculado: false,
    });
  });

  it('rejects a body missing nombre (US-040 delta — now required)', () => {
    expect(() =>
      authMeResponseSchema.parse({
        userId: 'u1',
        email: null,
        googleVinculado: false,
      }),
    ).toThrow();
  });

  it('rejects a body missing googleVinculado (VINC041-08 — required, not optional)', () => {
    expect(() =>
      authMeResponseSchema.parse({
        userId: 'u1',
        nombre: 'Jorge',
        email: null,
      }),
    ).toThrow();
  });

  it('parses a linked-account shape with googleVinculado: true', () => {
    const parsed = authMeResponseSchema.parse({
      userId: 'u1',
      nombre: 'Jorge',
      email: 'a@b.cl',
      googleVinculado: true,
    });

    expect(parsed.googleVinculado).toBe(true);
  });

  it('rejects googleVinculado as a non-boolean', () => {
    expect(() =>
      authMeResponseSchema.parse({
        userId: 'u1',
        nombre: 'Jorge',
        email: null,
        googleVinculado: 'false',
      }),
    ).toThrow();
  });

  it(
    'does NOT reject a user with email: null — transport shape only. ' +
      'The invariant (a user requires a non-null email) is a ' +
      'DOMAIN rule (buscarIdentidad), not enforced at this boundary schema.',
    () => {
      const result = authMeResponseSchema.safeParse({
        userId: 'u1',
        nombre: 'Jorge',
        email: null,
        googleVinculado: false,
      });

      expect(result.success).toBe(true);
    },
  );

  it('rejects email as a non-string, non-null value', () => {
    expect(() =>
      authMeResponseSchema.parse({ userId: 'u1', email: 42 }),
    ).toThrow();
  });
});
