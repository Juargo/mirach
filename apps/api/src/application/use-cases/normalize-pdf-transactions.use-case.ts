import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { IPdfTransactionNormalizer } from '../ports/pdf-transaction-normalizer.port';

export { EstructuraPdfInvalidaError, RangoFechasInvalidoError };

/**
 * NormalizePdfTransactionsUseCase — normaliza las filas de un PDF bancario ya
 * validado al esquema canónico (US-010). Mirror de
 * `ValidatePdfStructureUseCase` (PR3): delegación fina al port
 * `IPdfTransactionNormalizer` (infrastructure/pdf/), sin lógica propia.
 */
export class NormalizePdfTransactionsUseCase {
  constructor(private readonly normalizer: IPdfTransactionNormalizer) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      ReadonlyArray<Transaccion>,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    return this.normalizer.normalize(buffer, banco);
  }
}
