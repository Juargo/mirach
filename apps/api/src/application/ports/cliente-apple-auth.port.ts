import { Result } from '../../shared/result';
import { AppleAuthFallidoError } from '../../domain/errors/apple-auth-fallido.error';

/**
 * CanjeApple — lo que devuelve `/auth/token`: el refresh token y el `id_token`
 * de la misma autorización (permite comprobar a qué identidad pertenece el
 * code antes de guardar nada).
 */
export interface CanjeApple {
  readonly refreshToken: string;
  readonly idToken: string;
}

/**
 * IClienteAppleAuth — puerto hacia la API REST de Sign in with Apple
 * ("Generate and validate tokens" / "Revoke tokens"). Nunca lanza: todo fallo
 * es `Result.fail`, y ningún valor del error contiene credenciales.
 */
export interface IClienteAppleAuth {
  /**
   * Canjea el `authorizationCode` de la autorización nativa (un solo uso,
   * vence a los 5 minutos) y retorna el refresh token de Apple junto con su `id_token`.
   */
  intercambiarCodigo(
    codigo: string,
  ): Promise<Result<CanjeApple, AppleAuthFallidoError>>;

  /** Revoca un refresh token (`token_type_hint=refresh_token`). */
  revocarRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, AppleAuthFallidoError>>;
}
