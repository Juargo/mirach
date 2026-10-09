/**
 * MotivoAppleAuthFallido — razón por la que una llamada a la API REST de Sign
 * in with Apple (`/auth/token`, `/auth/revoke`) no produjo resultado. Solo
 * para logging server-side; ninguno de los valores es un secreto.
 *
 * - 'invalid_grant': Apple rechazó el `authorizationCode` (vencido — duran 5
 *   minutos —, ya usado o de otra app).
 * - 'rechazado': otra respuesta de error de Apple (4xx/5xx); `detalle` lleva
 *   el código de error de Apple (p. ej. `invalid_client`) o el status HTTP.
 * - 'timeout' / 'red': no hubo respuesta a tiempo / falló el transporte.
 * - 'respuesta-invalida': Apple respondió 200 con un cuerpo inutilizable.
 * - 'secret-no-disponible': no se pudo firmar el client secret.
 */
export type MotivoAppleAuthFallido =
  | 'invalid_grant'
  | 'rechazado'
  | 'timeout'
  | 'red'
  | 'respuesta-invalida'
  | 'secret-no-disponible';

/**
 * AppleAuthFallidoError — error del cliente de la API REST de Apple. `message`
 * es fijo y `detalle` solo admite un código corto ya saneado: nunca arrastra
 * el code, el refresh token ni el client secret.
 */
export class AppleAuthFallidoError extends Error {
  constructor(
    readonly motivo: MotivoAppleAuthFallido,
    readonly detalle?: string,
  ) {
    super('La llamada a la API de Apple falló.');
    this.name = 'AppleAuthFallidoError';
  }
}
