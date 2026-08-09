import { authCapabilitiesResponseSchema } from './auth-capabilities.schema';

describe('authCapabilitiesResponseSchema (AC-10)', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'parses googleLoginEnabled: %s, googleLoginMobileEnabled: %s (independent combination)',
    (googleLoginEnabled, googleLoginMobileEnabled) => {
      const parsed = authCapabilitiesResponseSchema.parse({
        googleLoginEnabled,
        googleLoginMobileEnabled,
      });

      expect(parsed).toEqual({ googleLoginEnabled, googleLoginMobileEnabled });
    },
  );

  it('rejects a missing googleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({ googleLoginMobileEnabled: true }),
    ).toThrow();
  });

  it('rejects a missing googleLoginMobileEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({ googleLoginEnabled: true }),
    ).toThrow();
  });

  it('rejects a non-boolean googleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: 'true',
        googleLoginMobileEnabled: true,
      }),
    ).toThrow();
  });

  it('rejects a non-boolean googleLoginMobileEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: true,
        googleLoginMobileEnabled: 'true',
      }),
    ).toThrow();
  });

  it('strips extra unknown fields (schema is not .strict(), per design §8/header correction 2)', () => {
    const parsed = authCapabilitiesResponseSchema.parse({
      googleLoginEnabled: true,
      googleLoginMobileEnabled: false,
      somethingElse: 'ignored-by-zod-default-strip',
    });

    expect(Object.keys(parsed).sort()).toEqual(
      ['googleLoginEnabled', 'googleLoginMobileEnabled'].sort(),
    );
  });
});
