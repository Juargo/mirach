import { Email } from '../../domain/value-objects/email';

/**
 * UsuarioApple — proyección mínima de un usuario para la resolución de
 * identidad de `LoginConAppleUseCase`.
 */
export interface UsuarioApple {
  readonly userId: string;
  readonly appleSub: string | null;
}

/**
 * NuevoUsuarioApple — input de `crearDesdeApple`. `nombre` llega ya resuelto
 * por el use case (el cuerpo de la primera autorización o un valor seguro por
 * defecto): Apple NO incluye el nombre en el identity token.
 */
export interface NuevoUsuarioApple {
  readonly email: Email;
  readonly appleSub: string;
  readonly nombre: string;
}

/**
 * IIdentidadAppleRepository — puerto de resolución de identidad Apple.
 * Gemelo de `IIdentidadGoogleRepository`, deliberadamente separado: cada
 * proveedor tiene su propia columna `sub` y mezclar ambos en un puerto
 * obligaría a tocar el flujo de Google, que no cambia.
 */
export interface IIdentidadAppleRepository {
  buscarPorAppleSub(appleSub: string): Promise<UsuarioApple | null>;
  buscarPorEmail(email: Email): Promise<UsuarioApple | null>;
  /**
   * true si el link se aplicó; false si la fila ya tenía otro `appleSub` o
   * hubo colisión de unicidad (P2002). Resultado de negocio, nunca lanza para
   * ese caso.
   */
  vincularAppleSub(userId: string, appleSub: string): Promise<boolean>;
  /**
   * Crea el usuario passwordless desde una identidad Apple verificada — email
   * cifrado + blind index (ADR-013), `appleSub` vinculado — y copia el
   * catálogo de clasificación (ADR-036) en la MISMA transacción. Retorna el
   * userId nuevo, o `null` si perdió la carrera de creación (P2002).
   */
  crearDesdeApple(datos: NuevoUsuarioApple): Promise<string | null>;
}
