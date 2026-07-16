import { Result } from '../../shared/result';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../../application/ports/pdf-structure-validator.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { PdfTextExtractor } from './pdf-text-extractor';
import { evaluarEstructura } from './pdf-structure-extraction';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile.strategy';
import { SantanderPdfStrategy } from './strategies/santander.strategy';
import { BciPdfStrategy } from './strategies/bci.strategy';

/**
 * PdfjsStructureValidatorService — implementación de IPdfStructureValidator.
 *
 * Extrae los tokens vía PdfTextExtractor (único punto de contacto con
 * pdfjs-dist, design.md decisión #2) y delega TODA la decisión a
 * `evaluarEstructura` (núcleo puro, testeado por separado con tokens
 * sintéticos en pdf-structure-extraction.spec.ts). Este archivo es solo el
 * shell de I/O: buffer → tokens → función pura → Result.
 */
export class PdfjsStructureValidatorService implements IPdfStructureValidator {
  private readonly extractor = new PdfTextExtractor();
  private readonly estructurasPorBanco: Map<BancoConocido, EstructuraPdfBanco>;

  constructor() {
    const strategies = [
      new BancoEstadoPdfStrategy(),
      new BancoChilePdfStrategy(),
      new SantanderPdfStrategy(),
      new BciPdfStrategy(),
    ];
    this.estructurasPorBanco = new Map(
      strategies.map((s) => {
        const e = s.getEstructura();
        return [e.banco, e];
      }),
    );
  }

  async validate(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      EstructuraPdfValidada,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    const estructura = this.estructurasPorBanco.get(banco);
    if (!estructura) {
      return Result.fail(
        new EstructuraPdfInvalidaError(banco, [
          {
            tipo: 'AnclaFaltante',
            ancla: '(sin configuración de estructura para este banco)',
          },
        ]),
      );
    }

    const extraido = await this.extractor.extract(buffer, `${banco}.pdf`);
    if (extraido.isFail()) {
      return Result.fail(
        new EstructuraPdfInvalidaError(banco, [{ tipo: 'PdfIlegible' }]),
      );
    }

    return evaluarEstructura(extraido.getValue(), estructura, banco);
  }
}
