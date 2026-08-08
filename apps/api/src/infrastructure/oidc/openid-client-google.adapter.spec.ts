import * as client from 'openid-client';

import { OpenIdClientGoogleAdapter } from './openid-client-google.adapter';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — OpenIdClientGoogleAdapter. `openid-client` mockeado en el
// boundary del módulo (design §11.2) — nunca una llamada de red real.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('openid-client', () => ({
  discovery: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  randomState: vi.fn(),
  randomNonce: vi.fn(),
}));

const discovery = vi.mocked(client.discovery);
const buildAuthorizationUrl = vi.mocked(client.buildAuthorizationUrl);
const authorizationCodeGrant = vi.mocked(client.authorizationCodeGrant);
const randomPKCECodeVerifier = vi.mocked(client.randomPKCECodeVerifier);
const calculatePKCECodeChallenge = vi.mocked(client.calculatePKCECodeChallenge);
const randomState = vi.mocked(client.randomState);
const randomNonce = vi.mocked(client.randomNonce);

const FAKE_CONFIG = {
  fake: 'configuration',
} as unknown as client.Configuration;

function makeAdapter(): OpenIdClientGoogleAdapter {
  return new OpenIdClientGoogleAdapter(
    'client-id-123',
    'client-secret-abc',
    'https://app.moneydiary.cl/api/auth/google/callback',
  );
}

beforeEach(() => {
  discovery.mockReset();
  buildAuthorizationUrl.mockReset();
  authorizationCodeGrant.mockReset();
  randomPKCECodeVerifier.mockReset();
  calculatePKCECodeChallenge.mockReset();
  randomState.mockReset();
  randomNonce.mockReset();

  discovery.mockResolvedValue(FAKE_CONFIG);
  randomPKCECodeVerifier.mockReturnValue('code-verifier-xyz');
  calculatePKCECodeChallenge.mockResolvedValue('code-challenge-xyz');
  randomState.mockReturnValue('state-xyz');
  randomNonce.mockReturnValue('nonce-xyz');
  buildAuthorizationUrl.mockReturnValue(
    new URL('https://accounts.google.com/o/oauth2/v2/auth?foo=bar'),
  );
});

describe('OpenIdClientGoogleAdapter.iniciar', () => {
  it('devuelve InicioAutorizacion con state/nonce/codeVerifier/urlAutorizacion poblados', async () => {
    const result = await makeAdapter().iniciar();

    expect(result.isOk()).toBe(true);
    const inicio = result.getValue();
    expect(inicio.state).toBe('state-xyz');
    expect(inicio.nonce).toBe('nonce-xyz');
    expect(inicio.codeVerifier).toBe('code-verifier-xyz');
    expect(inicio.urlAutorizacion).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?foo=bar',
    );
  });

  it('nunca lanza — envuelve un fallo de buildAuthorizationUrl en Result.fail', async () => {
    buildAuthorizationUrl.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await makeAdapter().iniciar();

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('discovery falla → Result.fail, y el memo se limpia para que el próximo intento reintente', async () => {
    discovery.mockRejectedValueOnce(new Error('network down'));
    const adapter = makeAdapter();

    const primero = await adapter.iniciar();
    expect(primero.isFail()).toBe(true);
    expect(discovery).toHaveBeenCalledTimes(1);

    const segundo = await adapter.iniciar();
    expect(segundo.isOk()).toBe(true);
    expect(discovery).toHaveBeenCalledTimes(2);
  });

  it('memoiza discovery entre llamadas exitosas (paga el costo una sola vez)', async () => {
    const adapter = makeAdapter();

    await adapter.iniciar();
    await adapter.iniciar();

    expect(discovery).toHaveBeenCalledTimes(1);
  });
});

describe('OpenIdClientGoogleAdapter.verificar', () => {
  const PARAMS = {
    urlCallback:
      'https://app.moneydiary.cl/api/auth/google/callback?code=abc&state=state-xyz',
    state: 'state-xyz',
    nonce: 'nonce-xyz',
    codeVerifier: 'code-verifier-xyz',
  };

  it('mapea claims a IdentidadExterna (sub/email/emailVerificado)', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: 'google-sub-1',
        email: 'jorge@example.com',
        email_verified: true,
      }),
    } as never);

    const result = await makeAdapter().verificar(PARAMS);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      sub: 'google-sub-1',
      email: 'jorge@example.com',
      emailVerificado: true,
    });
  });

  it('nunca lanza — envuelve una excepción de authorizationCodeGrant (id_token inválido) en Result.fail', async () => {
    authorizationCodeGrant.mockRejectedValue(
      new Error('invalid id_token signature'),
    );

    const result = await makeAdapter().verificar(PARAMS);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('access_token/refresh_token nunca aparecen en el shape retornado (AUTH-18)', async () => {
    authorizationCodeGrant.mockResolvedValue({
      access_token: 'live-access-token',
      refresh_token: 'live-refresh-token',
      claims: () => ({
        sub: 'google-sub-1',
        email: 'jorge@example.com',
        email_verified: true,
      }),
    } as never);

    const result = await makeAdapter().verificar(PARAMS);
    const identidad = result.getValue();

    expect(Object.keys(identidad).sort()).toEqual([
      'email',
      'emailVerificado',
      'sub',
    ]);
    expect(JSON.stringify(identidad)).not.toContain('live-access-token');
    expect(JSON.stringify(identidad)).not.toContain('live-refresh-token');
  });

  it('coalescing fail-closed: email ausente → null', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'google-sub-1', email_verified: true }),
    } as never);

    const result = await makeAdapter().verificar(PARAMS);

    expect(result.getValue().email).toBeNull();
  });

  it('coalescing fail-closed: email_verified AUSENTE (clave no presente) → false, nunca por truthy laxo (4R carry-forward)', async () => {
    authorizationCodeGrant.mockResolvedValue({
      // Sin `email_verified` en absoluto — no `undefined` leído, la clave no existe.
      claims: () => ({ sub: 'google-sub-1', email: 'jorge@example.com' }),
    } as never);

    const result = await makeAdapter().verificar(PARAMS);

    expect(result.getValue().emailVerificado).toBe(false);
  });

  it('claims() ausente (id_token no devuelto por el servidor) → Result.fail', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => undefined,
    } as never);

    const result = await makeAdapter().verificar(PARAMS);

    expect(result.isFail()).toBe(true);
  });
});
