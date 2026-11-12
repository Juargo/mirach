import { AceptacionTerminos } from '../../domain/value-objects/consentimiento';
import { Email } from '../../domain/value-objects/email';

export type ProveedorIdentidad = 'apple' | 'google';

export interface VinculacionDeIdentidad {
  readonly userId: string;
  readonly proveedor: ProveedorIdentidad;
  readonly sub: string;
  /** Email verificado del proveedor, o `null` si no hay uno utilizable. */
  readonly email: Email | null;
  /** Nombre entregado por el proveedor, o `null` para conservar el actual. */
  readonly nombre: string | null;
}

/**
 * ICuentaAnonimaRepository — alta y vinculación de cuentas anónimas (ADR-013).
 *
 * Una cuenta es anónima cuando no tiene `appleSub`, `googleSub` ni
 * `passwordHash`: es un estado derivado, no una columna.
 */
export interface ICuentaAnonimaRepository {
  /**
   * Crea el usuario sin credenciales, con el catálogo copiado de la plantilla
   * y la aceptación de términos, en UNA transacción. Retorna el userId.
   */
  crear(aceptacion: AceptacionTerminos | null): Promise<string>;
  /** `false` también cuando el usuario no existe. */
  esAnonima(userId: string): Promise<boolean>;
  existeIdentidad(proveedor: ProveedorIdentidad, sub: string): Promise<boolean>;
  /**
   * `true` si OTRA cuenta tiene ese email. La propia se excluye: una cuenta
   * anónima puede haber guardado su email en el perfil antes de vincular.
   */
  existeEmailEnOtraCuenta(email: Email, userId: string): Promise<boolean>;
  /**
   * Escritura condicional: solo aplica si la cuenta SIGUE siendo anónima.
   * `false` si dejó de serlo o si el `sub` o el email ya pertenecen a otra
   * cuenta (carrera perdida). Nunca lanza para esos casos.
   */
  vincular(datos: VinculacionDeIdentidad): Promise<boolean>;
}
