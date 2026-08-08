import { OAuth2Client } from 'google-auth-library';

import {
  GoogleIdTokenVerifier,
  ClienteVerificadorIdToken,
  ID_TOKEN_HTTP_TIMEOUT_MS,
} from './google-id-token.adapter';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';

vi.mock('google-auth-library', () => ({ OAuth2Client: vi.fn() }));

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — GoogleIdTokenVerifier. `google-auth-library` nunca se invoca
// realmente — el adapter recibe un double hand-written de
// `ClienteVerificadorIdToken` (design §5.2, ISP: el double implementa UN
// método, no el `OAuth2Client` entero).
// ──────────────────────────────────────────────────────────────────────────────

function makeCliente(
  impl: Partial<ClienteVerificadorIdToken> = {},
): ClienteVerificadorIdToken {
  return {
    verifyIdToken:
      impl.verifyIdToken ??
      vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'jorge@example.com',
          email_verified: true,
        }),
      }),
  };
}

const AUDIENCIAS = ['client-id-android-123.apps.googleusercontent.com'];

describe('GoogleIdTokenVerifier — cliente por defecto', () => {
  it('construye OAuth2Client con timeout HTTP acotado (nunca fetch sin deadline)', () => {
    new GoogleIdTokenVerifier(AUDIENCIAS);

    expect(OAuth2Client).toHaveBeenCalledWith({
      transporterOptions: { timeout: ID_TOKEN_HTTP_TIMEOUT_MS },
    });
  });
});

describe('GoogleIdTokenVerifier.verificarIdToken', () => {
  it('idToken vacío → Result.fail sin invocar el cliente', async () => {
    const cliente = makeCliente();
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
    expect(cliente.verifyIdToken).not.toHaveBeenCalled();
  });

  it('idToken en blanco (solo espacios) → Result.fail sin invocar el cliente', async () => {
    const cliente = makeCliente();
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('   ');

    expect(result.isFail()).toBe(true);
    expect(cliente.verifyIdToken).not.toHaveBeenCalled();
  });

  it('payload válido → mapea a IdentidadExterna (sub/email/emailVerificado)', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'jorge@example.com',
          email_verified: true,
        }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      sub: 'google-sub-1',
      email: 'jorge@example.com',
      emailVerificado: true,
    });
  });

  it('email ausente en el payload → email null (coalescing fail-closed)', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({ sub: 'google-sub-1', email_verified: true }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.getValue().email).toBeNull();
  });

  it('email_verified ausente (clave no presente) → emailVerificado false, nunca por truthy laxo', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({ sub: 'google-sub-1', email: 'jorge@example.com' }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.getValue().emailVerificado).toBe(false);
  });

  it('email_verified con valor no estrictamente true (ej. string "true") → emailVerificado false', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'jorge@example.com',
          email_verified: 'true' as unknown as boolean,
        }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.getValue().emailVerificado).toBe(false);
  });

  it('payload undefined → Result.fail', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => undefined,
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('payload sin sub → Result.fail', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          email: 'jorge@example.com',
          email_verified: true,
        }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('el cliente lanza (firma inválida, aud incorrecto, iss incorrecto, expirado) → Result.fail, nunca cruza la excepción', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi
        .fn()
        .mockRejectedValue(new Error('Wrong number of segments in token')),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt-malo');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('el cliente lanza por fallo de red (JWKS fetch) → Result.fail igual que un token inválido (design §5.3)', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi
        .fn()
        .mockRejectedValue(new Error('ENOTFOUND www.googleapis.com')),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('pasa un único audience configurado a verifyIdToken', async () => {
    const cliente = makeCliente();
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    await adapter.verificarIdToken('un-id-token-jwt');

    expect(cliente.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'un-id-token-jwt',
      audience: AUDIENCIAS,
    });
  });

  it('pasa múltiples audiences configurados a verifyIdToken', async () => {
    const variasAudiencias = [
      'client-id-android-123.apps.googleusercontent.com',
      'client-id-android-456.apps.googleusercontent.com',
    ];
    const cliente = makeCliente();
    const adapter = new GoogleIdTokenVerifier(variasAudiencias, cliente);

    await adapter.verificarIdToken('un-id-token-jwt');

    expect(cliente.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'un-id-token-jwt',
      audience: variasAudiencias,
    });
  });

  it('access_token/name/picture nunca aparecen en el shape retornado (AUTH-18)', async () => {
    const cliente = makeCliente({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'jorge@example.com',
          email_verified: true,
          name: 'Jorge',
          picture: 'https://example.com/pic.jpg',
        }),
      }),
    });
    const adapter = new GoogleIdTokenVerifier(AUDIENCIAS, cliente);

    const result = await adapter.verificarIdToken('un-id-token-jwt');
    const identidad = result.getValue();

    expect(Object.keys(identidad).sort()).toEqual([
      'email',
      'emailVerificado',
      'sub',
    ]);
  });
});
