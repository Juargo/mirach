import {
  Consentimiento,
  TipoConsentimiento,
  VersionConsentimiento,
} from '../../domain/value-objects/consentimiento';

/** IConsentimientoReader — lo que necesita el control de importación (PRI-02). */
export interface IConsentimientoReader {
  tieneVigente(userId: string, tipo: TipoConsentimiento): Promise<boolean>;
}

/**
 * IConsentimientoRepository — lectura más escritura, para
 * `/api/consentimientos`. Cada usuario tiene a lo más un registro vigente por
 * tipo, y los revocados se conservan como historial hasta borrar la cuenta.
 */
export interface IConsentimientoRepository extends IConsentimientoReader {
  /** Todos los registros del usuario, los más recientes primero. */
  listar(userId: string): Promise<Consentimiento[]>;

  /**
   * Aceptar la versión ya vigente no cambia nada y devuelve ese registro.
   * Aceptar otra revoca el registro vigente y crea uno nuevo.
   */
  aceptar(
    userId: string,
    tipo: TipoConsentimiento,
    version: VersionConsentimiento,
  ): Promise<Consentimiento>;

  /** Revoca el registro vigente; sin uno vigente no hace nada. */
  revocar(userId: string, tipo: TipoConsentimiento): Promise<void>;
}
