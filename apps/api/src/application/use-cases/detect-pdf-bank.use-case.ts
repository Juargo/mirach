import { Result } from '../../shared/result';
import {
  IPdfBankDetector,
  DetectedBank,
} from '../ports/pdf-bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { ILogger } from '../ports/logger.port';

export { BancoNoReconocidoError };

/**
 * DetectPdfBankUseCase — orquesta la detección del banco emisor para PDF.
 *
 * Mirror de DetectBankUseCase (Excel): recibe el buffer y nombre del
 * archivo ya validados por IngestFileUseCase y delega al IPdfBankDetector
 * (implementado en infrastructure/pdf/).
 */
export class DetectPdfBankUseCase {
  constructor(
    private readonly pdfBankDetector: IPdfBankDetector,
    private readonly logger: ILogger,
  ) {}

  async execute(
    buffer: Buffer,
    originalName: string,
  ): Promise<
    Result<
      DetectedBank,
      BancoNoReconocidoError | PdfInvalidoError | PdfSinTextoError
    >
  > {
    const result = await this.pdfBankDetector.detect(buffer, originalName);
    // Nunca el originalName crudo: puede traer info del usuario (ADR-013).
    this.logger.debug('detect-pdf-bank: bank detection outcome', {
      detected: result.isOk(),
      banco: result.isOk() ? result.getValue().banco : null,
    });
    return result;
  }
}
