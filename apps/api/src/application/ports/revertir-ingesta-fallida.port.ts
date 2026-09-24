import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * IRevertirIngestaFallidaWriter — port de aplicación (issue #778 tramo 5a-bis).
 *
 * Revierte una `Ingesta` que YA fue persistida como PROCESADA cuando la isla
 * de categorización post-persist (`ProcessIngestaUseCase.runCategorizacion`)
 * no puede garantizar que `bucketId`/`categoriaId` quedaron correctamente
 * asignados — hoy, cuando el WRITER de buckets
 * (`ITransaccionBucketWriter.asignarCategorizacion`) falla. Antes de este
 * tramo esa falla degradaba (las filas quedaban `bucketId = null`
 * indefinidamente); ahora se revierte la ingesta ENTERA: se borran las
 * transacciones recién insertadas y la `Ingesta` queda FALLIDA.
 *
 * Deliberadamente SEPARADO de dos ports existentes con los que podría
 * confundirse (SOLID ISP, mirrors el resto de los narrow ports de este
 * módulo):
 *   - `IIngestaRepository.persistirProcesada` solo sabe CREAR una Ingesta
 *     PROCESADA nueva — no UPDATEa una fila existente.
 *   - `IRegistrarIngestaFallidaWriter.registrar` solo sabe CREAR una fila
 *     FALLIDA nueva (el caso "nada se persistió todavía" — no hay
 *     `ingestaId` que actualizar). Usarlo acá crearía una SEGUNDA fila
 *     huérfana en vez de reusar la que ya existe — motivo por el que este
 *     tramo introduce un port propio en lugar de reusarlo.
 *
 * Contrato: retorna Result y NUNCA lanza. Las dos escrituras (borrar
 * transacciones + marcar FALLIDA) van en UNA transacción atómica — o las dos
 * ocurren, o ninguna.
 */
export interface IRevertirIngestaFallidaWriter {
  /**
   * @param userId - aislamiento multi-tenant (RNF-SEC-006): el borrado de
   *   transacciones filtra por `account: { userId }` en el WHERE SQL —
   *   NUNCA en memoria.
   * @param ingestaId - acota el borrado a las transacciones de ESTA corrida
   *   (una ingesta ANTERIOR del mismo usuario no se toca).
   * @param motivo - se persiste en `Ingesta.motivoFallo`. Nunca describe
   *   descripciones ni montos de transacciones (ADR-013) — es un mensaje
   *   técnico fijo, no interpolado con datos del archivo.
   */
  revertirYMarcarFallida(
    userId: string,
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const REVERTIR_INGESTA_FALLIDA_WRITER = 'IRevertirIngestaFallidaWriter';
