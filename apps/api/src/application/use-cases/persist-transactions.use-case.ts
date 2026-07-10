import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { IIngestaRepository } from '../ports/ingesta-repository.port';

/** Entrada del use case (account-agnostic: recibe accountId ya resuelto). */
export interface PersistTransactionsInput {
  accountId: string;
  banco: string;
  nombreArchivo: string;
  transacciones: ReadonlyArray<Transaccion>;
}

/** Salida del use case en caso de éxito. */
export interface PersistTransactionsResult {
  ingestaId: string;
  total: number;
}

/**
 * PersistTransactionsUseCase — persiste transacciones normalizadas bajo una
 * Ingesta, orquestando su ciclo de vida.
 *
 * Secuencia (decisiones 1-2 del diseño):
 *   1. createPending  → confirma la fila Ingesta en PENDIENTE (commit propio),
 *      de modo que una FALLIDA posterior sobreviva.
 *   2. commit         → escritura atómica (inserta filas + transiciona a
 *      PROCESADA) en una sola transacción a nivel de infraestructura.
 *   3. si commit falla → markFailed(motivo) y Result.fail; ninguna fila parcial.
 *
 * account-agnostic: recibe el accountId ya resuelto (el upsert de Account vive
 * en otro port/PR). Retorna Result y NUNCA lanza.
 */
export class PersistTransactionsUseCase {
  constructor(private readonly ingestaRepository: IIngestaRepository) {}

  async execute(
    input: PersistTransactionsInput,
  ): Promise<Result<PersistTransactionsResult, PersistenciaFallidaError>> {
    const pending = await this.ingestaRepository.createPending({
      accountId: input.accountId,
      banco: input.banco,
      nombreArchivo: input.nombreArchivo,
    });
    if (pending.isFail()) {
      return Result.fail(pending.getError());
    }
    const { ingestaId } = pending.getValue();

    const committed = await this.ingestaRepository.commit(
      ingestaId,
      input.accountId,
      input.transacciones,
    );
    if (committed.isFail()) {
      const error = committed.getError();
      // Defensivo: la misma caída de DB que abortó el commit puede hacer que
      // markFailed también falle o RECHACE. Nunca debe propagarse: execute
      // jamás lanza. Pase lo que pase con markFailed, devolvemos el error
      // ORIGINAL del commit (el relevante para el caller). Si markFailed no
      // completa, la Ingesta puede quedar PENDIENTE — se resolverá con el
      // seguimiento de reconciliación de PR3 (test de atomicidad real).
      try {
        await this.ingestaRepository.markFailed(ingestaId, error.motivo);
      } catch {
        // markFailed rechazó; preservamos "nunca lanza" y el error original.
      }
      return Result.fail(error);
    }

    return Result.ok({ ingestaId, total: committed.getValue().total });
  }
}
