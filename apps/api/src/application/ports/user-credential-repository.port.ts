import { Email } from '../../domain/value-objects/email';

/**
 * CredencialUsuario — fila de credenciales mínima para verificar login.
 * `passwordHash` es un hash argon2id de una vía (AUTH-03) — nunca texto plano.
 */
export interface CredencialUsuario {
  readonly userId: string;
  readonly passwordHash: string;
}

/**
 * IdentidadUsuario — identidad mínima para `GET /api/auth/me` (AUTH-09).
 * Sin hash, sin token. `email` es nullable porque los usuarios demo se crean
 * sin email (`esDemo=true`, DEMO-AUTH-05); `esDemo` distingue ambos casos en
 * la UI sin depender de que `email` sea `null`.
 */
export interface IdentidadUsuario {
  readonly userId: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}

/**
 * IUserCredentialRepository — puerto de lectura de credenciales/identidad de usuario.
 *
 * `buscarPorEmail` retorna `null` cuando el email es desconocido — el use case
 * (`LoginUseCase`) es responsable de convertir eso en el error genérico
 * `CredencialesInvalidasError` (AUTH-02, no enumeración). Este puerto no lanza
 * para casos de negocio; solo puede rechazar por fallas de infraestructura.
 */
export interface IUserCredentialRepository {
  buscarPorEmail(email: Email): Promise<CredencialUsuario | null>;
  buscarIdentidad(userId: string): Promise<IdentidadUsuario | null>;
}

/** Injection token — interfaces are erased at runtime; mirrors RESUMEN_MES_READER. */
export const USER_CREDENTIAL_REPOSITORY = 'IUserCredentialRepository';
