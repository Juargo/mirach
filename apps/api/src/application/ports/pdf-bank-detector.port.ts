import { Result } from '../../shared/result';
import { DetectedBank } from './bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

export type { DetectedBank };

/**
 * IPdfBankDetector — port de aplicación.
 *
 * Mismo contrato de resultado que IBankDetector (DetectedBank), agregando
 * los 2 errores propios de la carga PDF (design.md decisión #1: el
 * routing es un branch en ProcessIngestaUseCase, pero los ports/DTOs de
 * salida se mantienen uniformes entre ambos flujos).
 */
export interface IPdfBankDetector {
  detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<
    Result<
      DetectedBank,
      BancoNoReconocidoError | PdfInvalidoError | PdfSinTextoError
    >
  >;
}
