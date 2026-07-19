import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

/** Resultado de una reasignación exitosa. */
export interface ReclasificarCategoriaResult {
  readonly id: string;
  readonly categoria: Categoria;
  readonly bucket: Bucket;
}

/**
 * IReclasificarCategoriaWriter — port de escritura para la reclasificación
 * manual de una transacción (US-013, CATAPI-01/03/04).
 *
 * Narrow port (SOLID ISP): solo expone la operación que necesita
 * ReclasificarTransaccionUseCase. El bucket YA viene derivado por el use
 * case — el writer nunca lo recalcula, solo persiste ambas columnas
 * atómicamente en la misma fila.
 *
 * Contrato: `reasignar` DEBE aplicar aislamiento estructural por `userId`
 * (RNF-SEC-006) en la cláusula WHERE — nunca en app-layer. Un `count === 0`
 * (no existe O no es del usuario) se traduce a
 * `Result.fail(TransaccionNoEncontradaError)` — los dos casos son
 * indistinguibles (anti-enumeration).
 */
export interface IReclasificarCategoriaWriter {
  reasignar(
    userId: string,
    transaccionId: string,
    categoria: Categoria,
    bucket: Bucket,
  ): Promise<Result<ReclasificarCategoriaResult, TransaccionNoEncontradaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const RECLASIFICAR_CATEGORIA_WRITER = 'IReclasificarCategoriaWriter';
