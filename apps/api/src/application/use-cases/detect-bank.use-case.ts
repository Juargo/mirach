import { Result } from '../../shared/result';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';

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
  constructor(private readonly bankDetector: IBankDetector) {}

  async execute(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    return this.bankDetector.detect(buffer, originalName);
  }
}
