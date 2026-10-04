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
        appleLoginEnabled: false,
      });

      expect(parsed).toEqual({
        googleLoginEnabled,
        googleLoginMobileEnabled,
        appleLoginEnabled: false,
      });
    },
  );

  it('rejects a missing googleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginMobileEnabled: true,
        appleLoginEnabled: true,
      }),
    ).toThrow();
  });

  it('rejects a missing googleLoginMobileEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: true,
        appleLoginEnabled: true,
      }),
    ).toThrow();
  });

  it('rejects a non-boolean googleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: 'true',
        googleLoginMobileEnabled: true,
        appleLoginEnabled: true,
      }),
    ).toThrow();
  });

  it('rejects a non-boolean googleLoginMobileEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: true,
        googleLoginMobileEnabled: 'true',
        appleLoginEnabled: true,
      }),
    ).toThrow();
  });

  it('strips extra unknown fields (schema is not .strict(), per design §8/header correction 2)', () => {
    const parsed = authCapabilitiesResponseSchema.parse({
      googleLoginEnabled: true,
      googleLoginMobileEnabled: false,
      appleLoginEnabled: true,
      somethingElse: 'ignored-by-zod-default-strip',
    });

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'appleLoginEnabled',
        'googleLoginEnabled',
        'googleLoginMobileEnabled',
      ].sort(),
    );
  });

  it('rejects a missing appleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: true,
        googleLoginMobileEnabled: true,
      }),
    ).toThrow();
  });

  it('rejects a non-boolean appleLoginEnabled', () => {
    expect(() =>
      authCapabilitiesResponseSchema.parse({
        googleLoginEnabled: true,
        googleLoginMobileEnabled: true,
        appleLoginEnabled: 'true',
      }),
    ).toThrow();
  });
});
