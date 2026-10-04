/**
 * MotivoFalloApple — razones internas por las que el login con Apple puede
 * fallar. Solo para logging server-side: nunca cruza al cliente.
 *
 * - 'email-ausente': una cuenta NUEVA llegó sin email. Apple lo entrega en la
 *   primera autorización solo si la app pidió el scope `email`; sin él no se
 *   puede crear la cuenta (el email es obligatorio) y falla cerrado.
 */
export type MotivoFalloApple =
  | 'email-ausente'
  | 'email-no-verificado'
  | 'email-invalido'
  | 'ya-vinculado-a-otra-identidad'
  | 'link-perdio-la-carrera'
  | 'creacion-perdio-la-carrera';

/**
 * LoginConAppleFallidoError — el único error de `LoginConAppleUseCase` para
 * TODAS las ramas de fallo (no enumeración, misma disciplina que
 * `LoginConGoogleFallidoError`). `message` es fijo; `motivo` es solo para el
 * log y nunca llega al cliente.
 */
export class LoginConAppleFallidoError extends Error {
  constructor(readonly motivo: MotivoFalloApple) {
    super('No pudimos iniciar sesión con Apple.');
    this.name = 'LoginConAppleFallidoError';
  }
}
