import * as client from 'openid-client';

import {
  OpenIdClientGoogleAdapter,
  OIDC_TIMEOUT_SECONDS,
} from './openid-client-google.adapter';
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

  it('llama a buildAuthorizationUrl con redirect_uri/scope/code_challenge/code_challenge_method/state/nonce reales (4R C3 — sin esta assertion un swap state↔nonce pasaba desapercibido)', async () => {
    await makeAdapter().iniciar();

    expect(buildAuthorizationUrl).toHaveBeenCalledWith(FAKE_CONFIG, {
      redirect_uri: 'https://app.moneydiary.cl/api/auth/google/callback',
      scope: 'openid email',
      code_challenge: 'code-challenge-xyz',
      code_challenge_method: 'S256',
      state: 'state-xyz',
      nonce: 'nonce-xyz',
    });
  });

  it('swap-detection: state y nonce viajan a buildAuthorizationUrl en sus propios campos, nunca intercambiados (4R C3)', async () => {
    randomState.mockReturnValue('SOLO-STATE-1234');
    randomNonce.mockReturnValue('SOLO-NONCE-5678');

    await makeAdapter().iniciar();

    const llamada = buildAuthorizationUrl.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(llamada.state).toBe('SOLO-STATE-1234');
    expect(llamada.nonce).toBe('SOLO-NONCE-5678');
    expect(llamada.state).not.toBe(llamada.nonce);
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

  it('discovery() se llama con issuer/clientId/clientSecret inyectados Y un timeout explícito (4R C2 + R3 WARNING) — sin `timeout`, `Configuration.timeout` queda undefined y authorizationCodeGrant() nunca recibe un AbortSignal, pudiendo colgarse indefinidamente si Google se cuelga', async () => {
    await makeAdapter().iniciar();

    expect(discovery).toHaveBeenCalledWith(
      new URL('https://accounts.google.com'),
      'client-id-123',
      'client-secret-abc',
      undefined,
      { timeout: OIDC_TIMEOUT_SECONDS },
    );
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

  it('llama a authorizationCodeGrant con la URL de callback y pkceCodeVerifier/expectedState/expectedNonce tomados de ParametrosCallback (4R C3 — sin esta assertion un swap expectedState↔expectedNonce pasaba desapercibido, tsc no lo detecta porque ambos son string)', async () => {
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: 'google-sub-1',
        email: 'jorge@example.com',
        email_verified: true,
      }),
    } as never);

    await makeAdapter().verificar(PARAMS);

    expect(authorizationCodeGrant).toHaveBeenCalledWith(
      FAKE_CONFIG,
      new URL(PARAMS.urlCallback),
      {
        pkceCodeVerifier: PARAMS.codeVerifier,
        expectedState: PARAMS.state,
        expectedNonce: PARAMS.nonce,
      },
    );
  });

  it('swap-detection: expectedState y expectedNonce viajan en sus propios campos, nunca intercambiados (4R C3 — valores fixture distintos para state/nonce/verifier)', async () => {
    const paramsDistintos = {
      urlCallback:
        'https://app.moneydiary.cl/api/auth/google/callback?code=abc&state=SOLO-STATE-A',
      state: 'SOLO-STATE-A',
      nonce: 'SOLO-NONCE-B',
      codeVerifier: 'SOLO-VERIFIER-C',
    };
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'google-sub-1' }),
    } as never);

    await makeAdapter().verificar(paramsDistintos);

    const opciones = authorizationCodeGrant.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(opciones.expectedState).toBe('SOLO-STATE-A');
    expect(opciones.expectedNonce).toBe('SOLO-NONCE-B');
    expect(opciones.pkceCodeVerifier).toBe('SOLO-VERIFIER-C');
    expect(
      new Set([
        opciones.expectedState,
        opciones.expectedNonce,
        opciones.pkceCodeVerifier,
      ]).size,
    ).toBe(3);
  });

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
