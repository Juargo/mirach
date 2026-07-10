import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';

/** Datos mínimos para crear la Ingesta en estado PENDIENTE. */
export interface CrearIngestaInput {
  accountId: string;
  banco: string;
  nombreArchivo: string;
}

/**
 * IIngestaRepository — port de aplicación (lado de escritura).
 *
 * La Ingesta es la raíz de agregado que posee la escritura atómica: `commit`
 * inserta las transacciones y transiciona la Ingesta a PROCESADA dentro de una
 * única `prisma.$transaction` (a nivel de infraestructura). Aquí solo vive el
 * CONTRATO — la implementación Prisma llega en PR3.
 *
 * Ciclo de vida orquestado por PersistTransactionsUseCase:
 *   createPending (commit propio) → commit (atómico) → markFailed en caso de error.
 *
 * API asíncrona; retorna Result y NUNCA lanza en el contrato de aplicación.
 */
export interface IIngestaRepository {
  /** Crea la Ingesta en PENDIENTE y la confirma en su propio commit. */
  createPending(
    input: CrearIngestaInput,
  ): Promise<Result<{ ingestaId: string }, PersistenciaFallidaError>>;

  /**
   * Escritura atómica: inserta todas las transacciones y transiciona la
   * Ingesta a PROCESADA (totalTransacciones, procesadoEn) en una sola
   * transacción. Un fallo NO debe dejar filas parciales.
   */
  commit(
    ingestaId: string,
    accountId: string,
    transacciones: ReadonlyArray<Transaccion>,
  ): Promise<Result<{ total: number }, PersistenciaFallidaError>>;

  /**
   * Marca la Ingesta como FALLIDA registrando el motivo del fallo.
   * Retorna Result (NUNCA lanza): la misma caída de DB que abortó el commit
   * puede hacer fallar también este marcado, y el orquestador debe poder
   * manejarlo sin propagar excepciones.
   */
  markFailed(
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const INGESTA_REPOSITORY = 'IIngestaRepository';
