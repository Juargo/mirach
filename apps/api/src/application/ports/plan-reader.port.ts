import type { PermisoPlan, Suscripcion } from '../../domain/value-objects/plan';

/** Lo que el API guarda sobre los derechos de Plus de un usuario. */
export interface DerechosGuardados {
  readonly suscripcion: Suscripcion | null;
  /** Todos los permisos del usuario, vigentes o no. */
  readonly permisos: readonly PermisoPlan[];
}

/**
 * IPlanReader — lectura de la suscripción y los permisos de un usuario
 * (ADR-012 §2, ADR-015 §1). Acotada por `userId` (RNF-SEC-006).
 */
export interface IPlanReader {
  leer(userId: string): Promise<DerechosGuardados>;
}
