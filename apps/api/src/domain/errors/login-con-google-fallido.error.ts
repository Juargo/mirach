/**
 * MotivoFalloGoogle — las razones internas por las que el login con
 * Google puede fallar. Solo para logging server-side (design §6.1) — nunca
 * cruza al cliente, que solo ve `/login?error=google`.
 *
 * ADR-041: 'sin-match' se RETIRA de la unión — el no-match ahora CREA la
 * cuenta (signup-on-first-login). Su reemplazo en la rama de carrera de
 * creación perdida e irresoluble es 'creacion-perdio-la-carrera'.
 */
export type MotivoFalloGoogle =
  | 'email-no-verificado'
  | 'usuario-demo'
  | 'ya-vinculado-a-otra-identidad'
  | 'link-perdio-la-carrera'
  | 'creacion-perdio-la-carrera'
  | 'email-invalido';

/**
 * LoginConGoogleFallidoError — error de dominio.
 *
 * El único error que retorna `LoginConGoogleUseCase` para TODAS las ramas de
 * fallo (AUTH-15 — no enumeración, misma disciplina que
 * `CredencialesInvalidasError`). `message` es fijo e idéntico entre todos los
 * `motivo`; `motivo` existe solo para logging server-side y nunca se deriva
 * en el mensaje ni llega al cliente.
 */
export class LoginConGoogleFallidoError extends Error {
  constructor(readonly motivo: MotivoFalloGoogle) {
    super('No pudimos iniciar sesión con Google.');
    this.name = 'LoginConGoogleFallidoError';
  }
}
