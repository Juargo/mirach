import { Result } from '../../shared/result';
import {
  AppleAuthFallidoError,
  type MotivoAppleAuthFallido,
} from '../../domain/errors/apple-auth-fallido.error';
import { IClienteAppleAuth } from '../../application/ports/cliente-apple-auth.port';
import type { IProveedorClientSecretApple } from './apple-client-secret.signer';

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Deadline por llamada: Apple caído no debe colgar el login ni el borrado. */
export const APPLE_AUTH_TIMEOUT_MS = 5_000;

/** Solo códigos de error cortos tipo `invalid_client` llegan al log. */
const CODIGO_ERROR_APPLE = /^[a-z_]{1,40}$/;

/**
 * AppleAuthHttpClient — cliente HTTP de la API REST de Sign in with Apple.
 * `fetch` y el timeout se inyectan (los tests nunca tocan la red). Todo fallo
 * se mapea a `AppleAuthFallidoError`; el cuerpo de las respuestas de error se
 * descarta salvo el código `error` ya saneado, así ni el code, ni el refresh
 * token, ni el client secret pueden llegar a un log.
 */
export class AppleAuthHttpClient implements IClienteAppleAuth {
  constructor(
    private readonly clientId: string,
    private readonly secret: IProveedorClientSecretApple,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs: number = APPLE_AUTH_TIMEOUT_MS,
  ) {}

  async intercambiarCodigo(
    codigo: string,
  ): Promise<Result<string, AppleAuthFallidoError>> {
    const respuesta = await this.post(APPLE_TOKEN_URL, (clientSecret) => ({
      grant_type: 'authorization_code',
      code: codigo,
      client_id: this.clientId,
      client_secret: clientSecret,
    }));

    if (respuesta.isFail()) {
      return Result.fail(respuesta.getError());
    }

    const refreshToken = parsearRefreshToken(respuesta.getValue());
    return refreshToken === null
      ? Result.fail(new AppleAuthFallidoError('respuesta-invalida'))
      : Result.ok(refreshToken);
  }

  async revocarRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, AppleAuthFallidoError>> {
    const respuesta = await this.post(APPLE_REVOKE_URL, (clientSecret) => ({
      client_id: this.clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }));

    return respuesta.isFail()
      ? Result.fail(respuesta.getError())
      : Result.ok(undefined);
  }

  /** POST form-urlencoded; retorna el cuerpo de un 2xx como texto. */
  private async post(
    url: string,
    campos: (clientSecret: string) => Record<string, string>,
  ): Promise<Result<string, AppleAuthFallidoError>> {
    let clientSecret: string;
    try {
      clientSecret = await this.secret.obtener();
    } catch {
      return Result.fail(new AppleAuthFallidoError('secret-no-disponible'));
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(campos(clientSecret)).toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return Result.fail(
        new AppleAuthFallidoError(
          err instanceof Error && err.name === 'TimeoutError'
            ? 'timeout'
            : 'red',
        ),
      );
    }

    let texto: string;
    try {
      texto = await response.text();
    } catch {
      return Result.fail(new AppleAuthFallidoError('red'));
    }

    if (response.ok) {
      return Result.ok(texto);
    }

    return Result.fail(errorDeRespuesta(response.status, texto));
  }
}

function errorDeRespuesta(
  status: number,
  texto: string,
): AppleAuthFallidoError {
  const codigo = parsearCodigoError(texto);
  const motivo: MotivoAppleAuthFallido =
    codigo === 'invalid_grant' ? 'invalid_grant' : 'rechazado';

  return new AppleAuthFallidoError(motivo, codigo ?? String(status));
}

function parsearCodigoError(texto: string): string | null {
  try {
    const cuerpo: unknown = JSON.parse(texto);
    const error = (cuerpo as { error?: unknown } | null)?.error;
    return typeof error === 'string' && CODIGO_ERROR_APPLE.test(error)
      ? error
      : null;
  } catch {
    return null;
  }
}

function parsearRefreshToken(texto: string): string | null {
  try {
    const cuerpo: unknown = JSON.parse(texto);
    const token = (cuerpo as { refresh_token?: unknown } | null)?.refresh_token;
    return typeof token === 'string' && token !== '' ? token : null;
  } catch {
    return null;
  }
}
