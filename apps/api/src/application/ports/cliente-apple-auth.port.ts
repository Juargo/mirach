import { Result } from '../../shared/result';
import { AppleAuthFallidoError } from '../../domain/errors/apple-auth-fallido.error';

/**
 * IClienteAppleAuth — puerto hacia la API REST de Sign in with Apple
 * ("Generate and validate tokens" / "Revoke tokens"). Nunca lanza: todo fallo
 * es `Result.fail`, y ningún valor del error contiene credenciales.
 */
export interface IClienteAppleAuth {
  /**
   * Canjea el `authorizationCode` de la autorización nativa (un solo uso,
   * vence a los 5 minutos) y retorna el refresh token de Apple.
   */
  intercambiarCodigo(
    codigo: string,
  ): Promise<Result<string, AppleAuthFallidoError>>;

  /** Revoca un refresh token (`token_type_hint=refresh_token`). */
  revocarRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, AppleAuthFallidoError>>;
}
