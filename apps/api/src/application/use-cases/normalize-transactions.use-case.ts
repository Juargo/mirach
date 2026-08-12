import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import { ILogger } from '../ports/logger.port';

export { NormalizacionInvalidaError };

/**
 * NormalizeTransactionsUseCase — mapea las filas del archivo al esquema canónico
 * { fecha, descripcion, cargo, abono } usando el mapeo del banco identificado.
 *
 * Encadenado después de DetectBank + ValidateStructure. Devuelve Result<T,E>
 * sin lanzar.
 */
export class NormalizeTransactionsUseCase {
  constructor(
    private readonly normalizer: ITransactionNormalizer,
    private readonly logger: ILogger,
  ) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    const result = await this.normalizer.normalize(buffer, banco);
    // Solo el CONTEO de filas normalizadas — nunca montos/descripciones (ADR-013).
    this.logger.debug('normalize-transactions: rows normalized', {
      normalizado: result.isOk(),
      filas: result.isOk() ? result.getValue().length : 0,
    });
    return result;
  }
}
