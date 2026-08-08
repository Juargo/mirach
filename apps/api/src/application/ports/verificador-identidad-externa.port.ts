import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';

/** InicioAutorizacion — lo que el adapter produce para iniciar el flujo OIDC. */
export interface InicioAutorizacion {
  readonly urlAutorizacion: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/** IdentidadExterna — claims mínimos resueltos del `id_token` validado. */
export interface IdentidadExterna {
  readonly sub: string;
  readonly email: string | null;
  readonly emailVerificado: boolean;
}

/** ParametrosCallback — lo que la ruta de callback le pasa al verificador. */
export interface ParametrosCallback {
  readonly urlCallback: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/**
 * IIniciadorLoginExterno — puerto consumido por la ruta de inicio
 * (`GET /api/auth/google`).
 *
 * Rol separado de `IVerificadorIdentidadExterna` (ISP, design §4.1): la ruta
 * de inicio nunca verifica, y el use case nunca inicia. Un solo puerto de
 * dos métodos obligaría al double de `LoginConGoogleUseCase` a stubbear un
 * método que jamás puede invocar.
 */
export interface IIniciadorLoginExterno {
  iniciar(): Promise<
    Result<InicioAutorizacion, VerificacionIdentidadFallidaError>
  >;
}

/**
 * IVerificadorIdentidadExterna — puerto consumido por `LoginConGoogleUseCase`
 * (nombre fijado por ADR-034 §6).
 *
 * El adapter (`OpenIdClientGoogleAdapter`, infraestructura, slice B) implementa
 * ambos roles; ninguno de los dos deja cruzar una excepción cruda del SDK de
 * OIDC — siempre `Result` (ADR-005).
 */
export interface IVerificadorIdentidadExterna {
  verificar(
    p: ParametrosCallback,
  ): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>>;
}
