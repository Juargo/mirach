import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';

/**
 * IEliminarIngestaWriter — port de escritura para el borrado en cascada de
 * una ingesta (US-018, ING-01/ING-02).
 *
 * Narrow port (SOLID ISP): solo expone la operación que necesita
 * EliminarIngestaUseCase. Mirrors IReclasificarCategoriaWriter — un port
 * separado, no una extensión de IIngestaRepository (design.md §2, D3).
 *
 * Contrato: `eliminarConTransacciones` DEBE aplicar aislamiento estructural
 * por `userId` (RNF-SEC-006) en AMBAS cláusulas WHERE (hijo y padre) — nunca
 * en app-layer. Un `count === 0` en el padre (no existe O no es del usuario)
 * se traduce a `Result.fail(IngestaNoEncontradaError)` — los dos casos son
 * indistinguibles (anti-enumeration).
 */
export interface IEliminarIngestaWriter {
  eliminarConTransacciones(
    userId: string,
    ingestaId: string,
  ): Promise<Result<void, IngestaNoEncontradaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const ELIMINAR_INGESTA_WRITER = 'IEliminarIngestaWriter';
