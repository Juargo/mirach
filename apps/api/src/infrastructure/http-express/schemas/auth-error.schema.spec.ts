import { afterEach, describe, expect, it, vi } from 'vitest';
import * as codigos from '../auth-error-codes';

describe('auth error schemas — single source of the 401 codes', () => {
  afterEach(() => {
    vi.doUnmock('../auth-error-codes');
    vi.resetModules();
  });

  it('derive their enums and literals from auth-error-codes, not from repeated strings', async () => {
    vi.resetModules();
    vi.doMock('../auth-error-codes', () => ({
      ...codigos,
      API_KEY_INVALIDA: 'API_KEY_RENOMBRADA',
      SESION_INVALIDA: 'SESION_RENOMBRADA',
      CREDENCIALES_INVALIDAS: 'CREDENCIALES_RENOMBRADAS',
      CODIGOS_401: [
        'API_KEY_RENOMBRADA',
        'SESION_RENOMBRADA',
        'CREDENCIALES_RENOMBRADAS',
      ],
    }));
    const schemas = await import('./auth-error.schema.js');

    const codeOf =
      (schema: { safeParse: (v: unknown) => { success: boolean } }) =>
      (code: string) =>
        schema.safeParse({ message: 'm', code }).success;

    const protegida = codeOf(schemas.unauthorizedResponseSchema);
    expect(protegida('API_KEY_RENOMBRADA')).toBe(true);
    expect(protegida('SESION_RENOMBRADA')).toBe(true);
    expect(protegida('SESION_INVALIDA')).toBe(false);

    const soloApiKey = codeOf(schemas.apiKeyUnauthorizedResponseSchema);
    expect(soloApiKey('API_KEY_RENOMBRADA')).toBe(true);
    expect(soloApiKey('API_KEY_INVALIDA')).toBe(false);

    const credenciales = codeOf(schemas.credentialsUnauthorizedResponseSchema);
    expect(credenciales('API_KEY_RENOMBRADA')).toBe(true);
    expect(credenciales('CREDENCIALES_RENOMBRADAS')).toBe(true);
    expect(credenciales('CREDENCIALES_INVALIDAS')).toBe(false);
  });
});
