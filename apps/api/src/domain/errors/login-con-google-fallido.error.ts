/**
 * MotivoFalloGoogle — las seis razones internas por las que el login con
 * Google puede fallar. Solo para logging server-side (design §6.1) — nunca
 * cruza al cliente, que solo ve `/login?error=google`.
 */
export type MotivoFalloGoogle =
  | 'sin-match'
  | 'email-no-verificado'
  | 'usuario-demo'
  | 'ya-vinculado-a-otra-identidad'
  | 'link-perdio-la-carrera'
  | 'email-invalido';

/**
 * LoginConGoogleFallidoError — error de dominio.
 *
 * El único error que retorna `LoginConGoogleUseCase` para TODAS las ramas de
 * fallo (AUTH-15 — no enumeración, misma disciplina que
 * `CredencialesInvalidasError`). `message` es fijo e idéntico entre los seis
 * `motivo`; `motivo` existe solo para logging server-side y nunca se deriva
 * en el mensaje ni llega al cliente.
 */
export class LoginConGoogleFallidoError extends Error {
  constructor(readonly motivo: MotivoFalloGoogle) {
    super('No pudimos iniciar sesión con Google.');
    this.name = 'LoginConGoogleFallidoError';
  }
}
