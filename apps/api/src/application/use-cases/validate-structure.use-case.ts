import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../ports/structure-validator.port';
import { ILogger } from '../ports/logger.port';

export { EstructuraInvalidaError };

/**
 * ValidateStructureUseCase — verifica que el archivo cumpla la estructura
 * esperada del banco ya detectado (US-002).
 *
 * Recibe el buffer y el banco emitidos por DetectBankUseCase y delega la
 * validación al port IStructureValidator. Retorna Result<T,E> sin lanzar.
 */
export class ValidateStructureUseCase {
  constructor(
    private readonly validator: IStructureValidator,
    private readonly logger: ILogger,
  ) {}

  async execute(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ValidatedStructure, EstructuraInvalidaError>> {
    const result = await this.validator.validate(buffer, banco);
    // Solo el CONTEO de problemas de estructura — nunca el detalle crudo
    // (`problemas` puede llevar el header/celda encontrado, ADR-013).
    this.logger.debug('validate-structure: structure validation outcome', {
      valido: result.isOk(),
      problemasCount: result.isFail() ? result.getError().problemas.length : 0,
    });
    return result;
  }
}
