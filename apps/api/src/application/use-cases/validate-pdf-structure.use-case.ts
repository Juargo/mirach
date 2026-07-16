import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';

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
  constructor(private readonly validator: IPdfStructureValidator) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      EstructuraPdfValidada,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    return this.validator.validate(buffer, banco);
  }
}
