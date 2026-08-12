import {
  perfilUpdateRequestSchema,
  perfilErrorResponseSchema,
} from './perfil.schema';

/**
 * LAYER-HONESTY GATE (design.md §5.4, categorias.schema.ts precedent): no
 * length/format is enforced here — `nombre` (1-80) and `email` format are
 * DOMAIN rules (`NombrePerfilInvalidoError`, `Email` VO). The "email ⇒
 * passwordActual required" refine is SHAPE, not policy — the policy
 * (anti-enumeration collapse) lives in `ActualizarPerfilUseCase`.
 */
describe('perfilUpdateRequestSchema', () => {
  it('accepts nombre-only', () => {
    expect(
      perfilUpdateRequestSchema.safeParse({ nombre: 'Jorge' }).success,
    ).toBe(true);
  });

  it('accepts email + passwordActual', () => {
    expect(
      perfilUpdateRequestSchema.safeParse({
        email: 'a@b.cl',
        passwordActual: 'secreta',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty body — at least one of nombre/email required', () => {
    expect(perfilUpdateRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects email present WITHOUT passwordActual (shape, not the use-case policy)', () => {
    expect(
      perfilUpdateRequestSchema.safeParse({ email: 'a@b.cl' }).success,
    ).toBe(false);
  });

  it('rejects an unknown/extra field — .strict() (PERF040-07, a userId cannot ride along)', () => {
    expect(
      perfilUpdateRequestSchema.safeParse({
        nombre: 'Jorge',
        userId: 'otro-usuario',
      }).success,
    ).toBe(false);
  });

  it('does NOT enforce nombre length here — layer-honesty gate (domain owns 1-80)', () => {
    const result = perfilUpdateRequestSchema.safeParse({
      nombre: 'x'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('does NOT enforce email format here — layer-honesty gate (Email VO owns the format)', () => {
    const result = perfilUpdateRequestSchema.safeParse({
      email: 'not-an-email',
      passwordActual: 'x',
    });
    expect(result.success).toBe(true);
  });
});

describe('perfilErrorResponseSchema', () => {
  it('parses { message, code }', () => {
    const parsed = perfilErrorResponseSchema.parse({
      message: 'x',
      code: 'PERFIL_RECHAZADO',
    });
    expect(parsed).toEqual({ message: 'x', code: 'PERFIL_RECHAZADO' });
  });
});
