import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';
import { ILogger } from '../ports/logger.port';

export { EstructuraPdfInvalidaError, RangoFechasInvalidoError };

/**
 * ValidatePdfStructureUseCase — verifica que el PDF cumpla la estructura
 * esperada del banco ya detectado (US-009).
 *
 * Mirror de ValidateStructureUseCase (Excel): recibe el buffer y el banco
 * emitidos por DetectPdfBankUseCase y delega al port IPdfStructureValidator
 * (implementado en infrastructure/pdf/). Retorna Result<T,E> sin lanzar.
 */
export class ValidatePdfStructureUseCase {
  constructor(
    private readonly validator: IPdfStructureValidator,
    private readonly logger: ILogger,
  ) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      EstructuraPdfValidada,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    const result = await this.validator.validate(buffer, banco);
    // Solo el CONTEO de problemas — `EstructuraPdfInvalidaError.problemas`
    // trae el detalle crudo; `RangoFechasInvalidoError` no tiene `problemas`
    // (1 problema implícito: período faltante). Nunca el detalle (ADR-013).
    const error = result.isFail() ? result.getError() : undefined;
    this.logger.debug('validate-pdf-structure: structure validation outcome', {
      valido: result.isOk(),
      problemasCount: error
        ? 'problemas' in error
          ? error.problemas.length
          : 1
        : 0,
    });
    return result;
  }
}
