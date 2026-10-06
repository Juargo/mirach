import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import { IdentidadExterna } from './verificador-identidad-externa.port';

/**
 * IdentidadApple — `IdentidadExterna` + si el email es un relay privado
 * ("Ocultar mi correo"). Un relay es una dirección de Apple que reenvía al
 * usuario: sirve para contactarlo, pero NO prueba que la persona sea dueña de
 * una cuenta existente con otro email, así que nunca se usa para enlazar.
 */
export interface IdentidadApple extends IdentidadExterna {
  readonly emailPrivado: boolean;
}

/**
 * IVerificadorIdTokenApple — puerto consumido por la ruta
 * `POST /api/auth/apple/token`.
 *
 * Separado de `IVerificadorIdTokenExterno` (ISP/LSP): el flujo de Apple exige
 * el nonce crudo que generó la app y devuelve un campo extra; ampliar el
 * puerto de Google obligaría a ese adapter a ignorar un parámetro. El adapter
 * nunca deja cruzar una excepción de la librería JWT — siempre `Result`
 * (ADR-005); la causa vive solo en el log server-side.
 */
export interface IVerificadorIdTokenApple {
  verificarIdToken(
    idToken: string,
    nonce: string,
  ): Promise<Result<IdentidadApple, VerificacionIdentidadFallidaError>>;
}

/**
 * IVerificadorSubCanjeApple — verifica el `id_token` que Apple devuelve al
 * canjear un `authorizationCode` (mismas reglas de firma, issuer, audience y
 * expiración que el identity token nativo; SIN nonce, porque ese token no
 * lo lleva) y retorna su `sub`. Sirve para comprobar que el code canjeado
 * pertenece a la misma identidad que inició sesión.
 */
export interface IVerificadorSubCanjeApple {
  verificarSubDelCanje(
    idToken: string,
  ): Promise<Result<string, VerificacionIdentidadFallidaError>>;
}
