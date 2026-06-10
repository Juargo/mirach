import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { IStructureValidator, ValidatedStructure } from '../ports/structure-validator.port';

export { EstructuraInvalidaError };

/**
 * ValidateStructureUseCase — verifica que el archivo cumpla la estructura
 * esperada del banco ya detectado (US-002).
 *
 * Recibe el buffer y el banco emitidos por DetectBankUseCase y delega la
 * validación al port IStructureValidator. Retorna Result<T,E> sin lanzar.
 */
export class ValidateStructureUseCase {
  constructor(private readonly validator: IStructureValidator) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ValidatedStructure, EstructuraInvalidaError>> {
    return this.validator.validate(buffer, banco);
  }
}
