import { Email } from '../../domain/value-objects/email';
import { EmailNoDisponibleError } from '../../domain/errors/email-no-disponible.error';
import { Result } from '../../shared/result';

/**
 * CredencialUsuario — fila de credenciales mínima para verificar login.
 * `passwordHash` es un hash argon2id de una vía (AUTH-03) — nunca texto plano.
 */
export interface CredencialUsuario {
  readonly userId: string;
  readonly passwordHash: string;
}

/**
 * IdentidadUsuario — identidad mínima para `GET /api/auth/me` (AUTH-09) y
 * `PATCH /api/perfil` (US-040, Q2). Sin hash, sin token. `email` es nullable
 * porque los usuarios demo se crean sin email (`esDemo=true`, DEMO-AUTH-05);
 * `esDemo` distingue ambos casos en la UI sin depender de que `email` sea
 * `null`. `nombre` es REQUERIDO (US-040 delta): un campo opcional dejaría
 * que un productor lo olvide en silencio. Es PII en claro (ADR-013 no lo
 * cifra) — NUNCA loguear su valor (ADR-033, design.md D-07).
 */
export interface IdentidadUsuario {
  readonly userId: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly esDemo: boolean;
  /** VINC041-08. Derivado de `googleSub !== null`. El `googleSub` CRUDO nunca
   *  cruza este puerto: es un identificador estable de una identidad externa
   *  y no tiene ninguna razón para estar en un tipo que se serializa al wire. */
  readonly googleVinculado: boolean;
}

/**
 * IUserCredentialRepository — puerto de lectura/escritura de credenciales e
 * identidad de usuario (US-035 lectura, US-040 escritura).
 *
 * `buscarPorEmail` retorna `null` cuando el email es desconocido — el use case
 * (`LoginUseCase`) es responsable de convertir eso en el error genérico
 * `CredencialesInvalidasError` (AUTH-02, no enumeración). Este puerto no lanza
 * para casos de negocio; solo puede rechazar por fallas de infraestructura.
 */
export interface IUserCredentialRepository {
  buscarPorEmail(email: Email): Promise<CredencialUsuario | null>;
  buscarIdentidad(userId: string): Promise<IdentidadUsuario | null>;

  /**
   * PERF040-03. `null` tanto para usuario inexistente como para usuario sin
   * `passwordHash` (login solo-Google, ADR-034/035) — el use case colapsa
   * ambos al mismo `PerfilRechazadoError` (no enumeración, design.md §1/Q3).
   */
  buscarCredencialPorId(userId: string): Promise<CredencialUsuario | null>;

  /**
   * PERF040-01/02. `email` es el VALUE OBJECT, nunca un `string`: es lo que
   * hace IMPOSIBLE que un raw body alcance la derivación
   * ciphertext/blind-index (design.md D-01). Escribe ambas columnas del par
   * en UN solo `UPDATE`. Devuelve la identidad ya actualizada (idioma del
   * repo: crear/actualizar devuelven la entidad, `ICategoriaRepository`
   * precedent).
   */
  actualizarPerfil(input: {
    userId: string;
    nombre?: string;
    email?: Email;
  }): Promise<Result<IdentidadUsuario, EmailNoDisponibleError>>;

  /**
   * PERF040-05. `passwordHash` YA viene hasheado por `IPasswordHasher` — este
   * puerto nunca ve texto plano. `void`: no queda falla de negocio que
   * modelar en este punto (la fila ya se leyó dos pasos antes). Usa `update`
   * (no `updateMany`) para que una fila borrada a mitad de camino (F8) sea
   * ruidosa (throw) en vez de silenciosa.
   */
  actualizarPassword(userId: string, passwordHash: string): Promise<void>;
}

/** Injection token — interfaces are erased at runtime; mirrors RESUMEN_MES_READER. */
export const USER_CREDENTIAL_REPOSITORY = 'IUserCredentialRepository';
