import { Result } from '../../shared/result';
import { DetectedBank } from './bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfProtegidoError } from '../../domain/errors/pdf-protegido.error';

export type { DetectedBank };

/**
 * IPdfBankDetector — port de aplicación.
 *
 * Mismo contrato de resultado que IBankDetector (DetectedBank), agregando
 * los 2 errores propios de la carga PDF (design.md decisión #1: el
 * routing es un branch en ProcessIngestaUseCase, pero los ports/DTOs de
 * salida se mantienen uniformes entre ambos flujos).
 *
 * `password?` (design.md D-01) es un parámetro OPCIONAL Y AL FINAL — ningún
 * caller/implementación existente deja de compilar por omitirlo. Solo este
 * port (el primero de los 3 en correr, D-06) widening su unión de error con
 * `PdfProtegidoError`: detección corre primero en el pipeline compartido y
 * corta ahí mismo, así que validate/normalize nunca llegan a ver un PDF con
 * password sin resolver (D-05).
 */
export interface IPdfBankDetector {
  detect(
    buffer: Buffer,
    originalName: string,
    password?: string,
  ): Promise<
    Result<
      DetectedBank,
      | BancoNoReconocidoError
      | PdfInvalidoError
      | PdfSinTextoError
      | PdfProtegidoError
    >
  >;
}
