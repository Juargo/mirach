import { Email } from '../../domain/value-objects/email';

/**
 * UsuarioVinculable — proyección mínima de un usuario, para la resolución de
 * identidad de `LoginConGoogleUseCase` (design §5.2).
 *
 * `esDemo` se retorna en lugar de filtrarse en SQL: la regla de negocio
 * (excluir demo del link/lookup) vive en el use case, no en el repositorio.
 */
export interface UsuarioVinculable {
  readonly userId: string;
  readonly esDemo: boolean;
  readonly googleSub: string | null;
}

/**
 * IIdentidadGoogleRepository — puerto de resolución de identidad Google
 * (design §5.2). Deliberadamente separado de `IUserCredentialRepository`:
 * ese puerto retorna `null` para un usuario sin password (semántica correcta
 * para login con contraseña, incorrecta para linkear Google — un usuario sin
 * password es un target de link perfectamente válido).
 */
export interface IIdentidadGoogleRepository {
  buscarPorGoogleSub(googleSub: string): Promise<UsuarioVinculable | null>;
  buscarPorEmail(email: Email): Promise<UsuarioVinculable | null>;
  /**
   * true si el link se aplicó; false si la fila ya tenía otro `googleSub` o
   * hubo colisión de unicidad (P2002, carrera concurrente — design §5.4).
   * Nunca lanza para este caso: es un resultado de negocio, no una falla de
   * infraestructura.
   */
  vincularGoogleSub(userId: string, googleSub: string): Promise<boolean>;

  /**
   * VINC041-03/04. Proyección por PK — el vínculo explícito conoce su propio
   * `userId` (viene firmado, `link-intent.ts`) y no busca por email ni por
   * sub. `esDemo` viaja en la proyección porque el callback NO tiene sesión:
   * el gate demo se DERIVA de la fila, no de un input (design §2/D-05).
   */
  buscarPorId(userId: string): Promise<UsuarioVinculable | null>;
}

/** Injection token — interfaces are erased at runtime. */
export const IDENTIDAD_GOOGLE_REPOSITORY = 'IIdentidadGoogleRepository';
