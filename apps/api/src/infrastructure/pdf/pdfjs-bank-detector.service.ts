import { Result } from '../../shared/result';
import {
  IPdfBankDetector,
  DetectedBank,
} from '../../application/ports/pdf-bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfTextExtractor } from './pdf-text-extractor';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile.strategy';
import { SantanderPdfStrategy } from './strategies/santander.strategy';
import { BciPdfStrategy } from './strategies/bci.strategy';

/**
 * PdfjsBankDetectorService — implementación de IPdfBankDetector.
 *
 * Extrae los tokens de texto vía PdfTextExtractor (único punto de contacto
 * con pdfjs-dist, design.md decisión #2) y ejecuta las 4 estrategias en el
 * MISMO orden que ExcelBankDetectorService — más específico primero
 * (design.md decisión #6): BancoEstado → Banco de Chile → Santander → BCI.
 *
 * Solo se evalúan los anclas de la página 1 — los 4 bancos ponen su
 * encabezado ahí.
 */
export class PdfjsBankDetectorService implements IPdfBankDetector {
  private readonly extractor = new PdfTextExtractor();
  private readonly strategies = [
    new BancoEstadoPdfStrategy(), // Primero: patrón más específico
    new BancoChilePdfStrategy(),
    new SantanderPdfStrategy(),
    new BciPdfStrategy(), // Último: patrón más genérico
  ];

  async detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<
    Result<
      DetectedBank,
      BancoNoReconocidoError | PdfInvalidoError | PdfSinTextoError
    >
  > {
    const extraido = await this.extractor.extract(buffer, originalName);
    if (extraido.isFail()) {
      return Result.fail(extraido.getError());
    }

    const tokensPagina1 = extraido.getValue().filter((t) => t.page === 1);

    for (const strategy of this.strategies) {
      if (strategy.matches(tokensPagina1)) {
        return Result.ok(strategy.extract(tokensPagina1));
      }
    }

    return Result.fail(new BancoNoReconocidoError(originalName));
  }
}
