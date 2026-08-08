import { authCapabilitiesResponseSchema } from './auth-capabilities.schema';

describe('authCapabilitiesResponseSchema (AC-10)', () => {
  it('parses googleLoginEnabled: true', () => {
    const parsed = authCapabilitiesResponseSchema.parse({
      googleLoginEnabled: true,
    });

    expect(parsed).toEqual({ googleLoginEnabled: true });
  });

  it('parses googleLoginEnabled: false', () => {
    const parsed = authCapabilitiesResponseSchema.parse({
      googleLoginEnabled: false,
    });

    expect(parsed).toEqual({ googleLoginEnabled: false });
  });

  it('rejects a missing googleLoginEnabled', () => {
    expect(() => authCapabilitiesResponseSchema.parse({})).toThrow();
  });

  it('rejects a non-boolean googleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({ googleLoginEnabled: 'true' }),
    ).toThrow();
  });

  it('rejects extra unknown fields being relied upon (structural shape only has this one key)', () => {
    const parsed = authCapabilitiesResponseSchema.parse({
      googleLoginEnabled: true,
      somethingElse: 'ignored-by-zod-default-strip',
    });

    expect(Object.keys(parsed)).toEqual(['googleLoginEnabled']);
  });
});
