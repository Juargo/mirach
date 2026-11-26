import type { DerechosCuenta } from '../../domain/value-objects/plan';

/**
 * IPlanReader — lectura de lo que decide el plan de un usuario: cuándo se creó
 * su cuenta, su suscripción y sus permisos (ADR-012 §2, ADR-015). Acotada por
 * `userId` (RNF-SEC-006).
 */
export interface IPlanReader {
  leer(userId: string): Promise<DerechosCuenta>;

  /**
   * Cupos del plan Fundador ya usados: permisos `fundador` vigentes de todas
   * las cuentas, sin las compras de sandbox (PLA-10). Es un conteo, no expone
   * datos de ningún usuario.
   */
  contarFundadoresVendidos(): Promise<number>;
}
