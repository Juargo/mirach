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

/**
 * IVerificadorIdTokenExterno — puerto consumido por la ruta del token mobile
 * (`POST /api/auth/google/token`, ADR-035, AUTH-19).
 *
 * Tercer rol en este archivo, NO un método agregado a
 * `IVerificadorIdentidadExterna` (design §4, D3): el input es un JWT crudo en
 * lugar de `ParametrosCallback`, y el único adapter de OIDC existente
 * (`OpenIdClientGoogleAdapter`) no tiene una forma limpia de implementarlo
 * (LSP — forzaría un `throw new Error('no implementado')`). El adapter que sí
 * lo implementa (`GoogleIdTokenVerifier`, infraestructura, slice A1) nunca
 * deja cruzar una excepción de `google-auth-library` a través del puerto
 * (ADR-005).
 */
export interface IVerificadorIdTokenExterno {
  verificarIdToken(
    idToken: string,
  ): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>>;
}
