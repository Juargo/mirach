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
 * NuevoUsuarioGoogle — input de `crearDesdeGoogle` (ADR-041). `nombre` llega
 * ya derivado por el use case (parte local del email normalizado — la
 * identidad OIDC de este flujo no pide el claim `name`, ver ADR-041).
 */
export interface NuevoUsuarioGoogle {
  readonly email: Email;
  readonly googleSub: string;
  readonly nombre: string;
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

  /**
   * ADR-041 (signup-on-first-login). Crea el usuario passwordless desde una
   * identidad Google verificada — email cifrado + blind index, `googleSub`
   * ya vinculado, `passwordHash` NULL — y materializa su catálogo de
   * clasificación (invariante ADR-036) en la MISMA transacción. Retorna el
   * userId nuevo, o `null` si perdió la carrera de creación (P2002 en
   * `emailBlindIndex` o `googleSub` — otra petición ocupó la identidad entre
   * el lookup y este write). Nunca lanza para ese caso: resultado de
   * negocio, no falla de infraestructura (misma convención que
   * `vincularGoogleSub`).
   */
  crearDesdeGoogle(datos: NuevoUsuarioGoogle): Promise<string | null>;

  /**
   * VINC041-05, CA-03. Escritura condicional única — nunca lee-y-luego-escribe:
   * `true` si limpió `googleSub` (la fila tenía password Y googleSub); `false`
   * si no había nada que limpiar (idempotente: la fila no tenía googleSub, o
   * no tiene passwordHash — en ese último caso el invariante "nunca sin
   * método de acceso" vive en esta escritura, no en un pre-check de
   * aplicación).
   */
  desvincularGoogleSub(userId: string): Promise<boolean>;
}

/** Injection token — interfaces are erased at runtime. */
export const IDENTIDAD_GOOGLE_REPOSITORY = 'IIdentidadGoogleRepository';
