/**
 * ICuentaRepository — port de borrado de una cuenta de usuario completa
 * (Apple 5.1.1(v), Google Play, Ley 21.719).
 *
 * Contrato: `eliminar` borra TODO lo del usuario (sesiones de todos sus
 * dispositivos, transacciones, ingestas, patrones, categorías, cuentas
 * bancarias y el propio usuario) en UNA transacción: o se borra todo o nada.
 * Todo borrado está acotado por `userId` (RNF-SEC-006): nunca toca filas de
 * otro usuario. Idempotente: si el usuario ya no existe no falla.
 * Los fallos de infraestructura propagan como excepción (→ 500).
 */
export interface ICuentaRepository {
  eliminar(userId: string): Promise<void>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CUENTA_REPOSITORY = 'ICuentaRepository';
