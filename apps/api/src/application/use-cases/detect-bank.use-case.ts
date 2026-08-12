import { Result } from '../../shared/result';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { ILogger } from '../ports/logger.port';

export { BancoNoReconocidoError };

/**
 * DetectBankUseCase — orquesta la detección del banco emisor.
 *
 * Recibe el buffer y nombre del archivo ya validados por IngestFileUseCase
 * y delega la detección al IBankDetector (implementado en infraestructura).
 *
 * API asíncrona porque IBankDetector.detect() es async (ExcelJS). Ver ADR-007.
 */
export class DetectBankUseCase {
  constructor(
    private readonly bankDetector: IBankDetector,
    private readonly logger: ILogger,
  ) {}

  async execute(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    const result = await this.bankDetector.detect(buffer, originalName);
    // Nunca el originalName crudo: puede traer info del usuario (ADR-013).
    this.logger.debug('detect-bank: bank detection outcome', {
      detected: result.isOk(),
      banco: result.isOk() ? result.getValue().banco : null,
    });
    return result;
  }
}
