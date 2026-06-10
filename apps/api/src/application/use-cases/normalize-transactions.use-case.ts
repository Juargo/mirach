import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';

export { NormalizacionInvalidaError };

/**
 * NormalizeTransactionsUseCase — mapea las filas del archivo al esquema canónico
 * { fecha, descripcion, cargo, abono } usando el mapeo del banco identificado.
 *
 * Encadenado después de DetectBank + ValidateStructure. Devuelve Result<T,E>
 * sin lanzar.
 */
export class NormalizeTransactionsUseCase {
  constructor(private readonly normalizer: ITransactionNormalizer) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    return this.normalizer.normalize(buffer, banco);
  }
}
