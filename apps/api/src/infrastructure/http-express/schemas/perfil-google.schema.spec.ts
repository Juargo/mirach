import {
  vincularGoogleRequestSchema,
  vincularGoogleResponseSchema,
  desvincularGoogleRequestSchema,
} from './perfil-google.schema';

/**
 * LAYER-HONESTY GATE (design.md §5.4, `perfil.schema.ts` precedent): no
 * `.min()` on `passwordActual` (it is VERIFIED, not VALIDATED — a length
 * rule here would leak the password policy to an unauthenticated shape
 * check) and no `.url()` on `urlAutorizacion` (server-generated; a format
 * assertion on our own output is theatre).
 */
describe('vincularGoogleRequestSchema', () => {
  it('accepts { passwordActual }', () => {
    expect(
      vincularGoogleRequestSchema.safeParse({ passwordActual: 'x' }).success,
    ).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(vincularGoogleRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an extra field (.strict(), VINC041-08 — a userId cannot ride along)', () => {
    expect(
      vincularGoogleRequestSchema.safeParse({
        passwordActual: 'x',
        userId: 'otro-usuario',
      }).success,
    ).toBe(false);
  });

  it('does NOT enforce a minimum length on passwordActual — layer-honesty gate', () => {
    expect(
      vincularGoogleRequestSchema.safeParse({ passwordActual: '' }).success,
    ).toBe(true);
  });
});

describe('vincularGoogleResponseSchema', () => {
  it('accepts { urlAutorizacion }', () => {
    expect(
      vincularGoogleResponseSchema.safeParse({
        urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      }).success,
    ).toBe(true);
  });

  it('does NOT enforce a URL format on urlAutorizacion — layer-honesty gate (server-generated output)', () => {
    expect(
      vincularGoogleResponseSchema.safeParse({ urlAutorizacion: 'not-a-url' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing urlAutorizacion', () => {
    expect(vincularGoogleResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('desvincularGoogleRequestSchema (VINC041-05, task 3.6)', () => {
  it('accepts { passwordActual }', () => {
    expect(
      desvincularGoogleRequestSchema.safeParse({ passwordActual: 'x' }).success,
    ).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(desvincularGoogleRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an extra field (.strict(), VINC041-08 — a userId cannot ride along)', () => {
    expect(
      desvincularGoogleRequestSchema.safeParse({
        passwordActual: 'x',
        userId: 'otro-usuario',
      }).success,
    ).toBe(false);
  });

  it('does NOT enforce a minimum length on passwordActual — layer-honesty gate', () => {
    expect(
      desvincularGoogleRequestSchema.safeParse({ passwordActual: '' }).success,
    ).toBe(true);
  });
});
