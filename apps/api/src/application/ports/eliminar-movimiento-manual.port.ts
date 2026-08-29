import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

/**
 * IEliminarMovimientoManualWriter — port de escritura para el borrado de un
 * movimiento manual (correccion-movimientos-manuales, ADR-040, D-01).
 *
 * Narrow port (SOLID ISP): solo expone la operación que necesita
 * EliminarMovimientoManualUseCase. Mirrors IEliminarIngestaWriter — un port
 * separado, no una extensión de un repository más amplio.
 *
 * Contrato: `eliminarManual` DEBE aplicar aislamiento estructural por
 * `userId` (RNF-SEC-006) Y por `origen: 'Manual'` en la MISMA cláusula
 * WHERE — nunca en app-layer. Un `count === 0` (no existe, no es del
 * usuario, O no es manual) se traduce a
 * `Result.fail(TransaccionNoEncontradaError)` — los tres casos son
 * indistinguibles (anti-enumeration, DEL-02).
 */
export interface IEliminarMovimientoManualWriter {
  eliminarManual(
    userId: string,
    transaccionId: string,
  ): Promise<Result<void, TransaccionNoEncontradaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const ELIMINAR_MOVIMIENTO_MANUAL_WRITER =
  'IEliminarMovimientoManualWriter';
