import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { IIngestaRepository } from '../ports/ingesta-repository.port';
import { ILogger } from '../ports/logger.port';

/** Entrada del use case. `userId` viaja explícito (US-004) — ya disponible
 * en `runPipeline` como `input.userId` (session-guaranteed), no un lookup
 * nuevo. */
export interface PersistTransactionsInput {
  userId: string;
  accountId: string;
  banco: string;
  nombreArchivo: string;
  transacciones: ReadonlyArray<Transaccion>;
  /** Conteo de duplicados detectados y omitidos ANTES de persistir (US-005). */
  duplicadosOmitidos: number;
}

/** Salida del use case en caso de éxito. */
export interface PersistTransactionsResult {
  ingestaId: string;
  total: number;
  /** Ecoado desde el input — persistirProcesada solo retorna {ingestaId,total}. */
  duplicadosOmitidos: number;
}

/**
 * PersistTransactionsUseCase — persiste transacciones normalizadas bajo una
 * Ingesta PROCESADA.
 *
 * US-004 (design.md §3.1/D1, §6.4): el ciclo de vida COLAPSA a una única
 * llamada atómica — `createPending`/`commit`/`markFailed` desaparecen porque
 * la falla ahora es responsabilidad EXCLUSIVA del boundary
 * `ProcessIngestaUseCase` (vía `IRegistrarIngestaFallidaWriter`,
 * single-writer-per-state). Este use case ya no orquesta un ciclo de vida —
 * es un pass-through: delega a `persistirProcesada` y ecoa
 * `duplicadosOmitidos` (que la escritura atómica no retorna).
 *
 * account-agnostic: recibe el accountId ya resuelto (el upsert de Account
 * vive en otro port). Retorna Result y NUNCA lanza.
 */
export class PersistTransactionsUseCase {
  constructor(
    private readonly ingestaRepository: IIngestaRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: PersistTransactionsInput,
  ): Promise<Result<PersistTransactionsResult, PersistenciaFallidaError>> {
    const res = await this.ingestaRepository.persistirProcesada({
      userId: input.userId,
      accountId: input.accountId,
      banco: input.banco,
      nombreArchivo: input.nombreArchivo,
      transacciones: input.transacciones,
      duplicadosOmitidos: input.duplicadosOmitidos,
    });
    if (res.isFail()) {
      this.logger.debug('persist-transactions: persist failed', {
        persistido: false,
        accountId: input.accountId,
      });
      return Result.fail(res.getError());
    }
    const { ingestaId, total } = res.getValue();
    // ingestaId/accountId son IDs internos (no PII); nunca el nombreArchivo
    // ni las transacciones (ADR-013).
    this.logger.debug('persist-transactions: persisted', {
      persistido: true,
      ingestaId,
      accountId: input.accountId,
      total,
      duplicadosOmitidos: input.duplicadosOmitidos,
    });
    return Result.ok({
      ingestaId,
      total,
      duplicadosOmitidos: input.duplicadosOmitidos,
    });
  }
}
