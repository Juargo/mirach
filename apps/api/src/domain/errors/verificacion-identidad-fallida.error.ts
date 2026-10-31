/**
 * VerificacionIdentidadFallidaError — error de dominio, nivel puerto.
 *
 * Retornado por `IIniciadorLoginExterno`/`IVerificadorIdentidadExterna`
 * (design §4.1/§4.2) cuando el intercambio OIDC contra el proveedor externo
 * falla — discovery, intercambio de código, o validación de `id_token`
 * (firma/`iss`/`aud`/`exp`/`nonce`). El adapter NUNCA deja cruzar una
 * excepción de `openid-client` a través del puerto (ADR-005).
 *
 * `motivo` es texto libre solo para logging server-side (nunca el `code`,
 * `state`, `id_token` ni ningún valor crudo — AUTH-18); `message` es fijo y
 * no se deriva de `motivo`, para que el llamador (la ruta HTTP, y en
 * cascada `LoginConGoogleUseCase` vía AUTH-15) no filtre la causa real.
 *
 * `proveedorCaido` separa "el token no sirve" de "no pudimos preguntarle al
 * proveedor" (#115): lo segundo no dice nada sobre la credencial, así que las
 * rutas de token responden 503 y no el 401 de una credencial inválida.
 */
export class VerificacionIdentidadFallidaError extends Error {
  constructor(
    readonly motivo: string,
    readonly proveedorCaido: boolean = false,
  ) {
    super('No se pudo verificar la identidad externa.');
    this.name = 'VerificacionIdentidadFallidaError';
  }
}
