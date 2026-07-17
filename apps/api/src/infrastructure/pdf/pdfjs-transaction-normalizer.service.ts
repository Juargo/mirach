import { Result } from '../../shared/result';
import { IPdfTransactionNormalizer } from '../../application/ports/pdf-transaction-normalizer.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { PdfTextExtractor } from './pdf-text-extractor';
import { evaluarEstructura } from './pdf-structure-extraction';
import { normalizarTransaccionesPdf } from './pdf-normalization';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { SantanderPdfStrategy } from './strategies/santander.strategy';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile.strategy';
import { BciPdfStrategy } from './strategies/bci.strategy';

/**
 * PdfjsTransactionNormalizerService — implementación de IPdfTransactionNormalizer.
 *
 * Shell de I/O (mismo patrón que PdfjsStructureValidatorService, PR3):
 * buffer → tokens (PdfTextExtractor) → re-valida estructura + extrae período
 * (`evaluarEstructura`, reutilizado de PR3) → núcleo puro
 * `normalizarTransaccionesPdf`. Reutilizar `evaluarEstructura` en vez de
 * reinstanciar `PdfjsStructureValidatorService` evita un segundo
 * `extractor.extract` DENTRO de esta misma llamada — design.md decisión #3
 * acepta 3× parse ENTRE etapas (detectar/validar/normalizar), no una 4ª
 * interna.
 *
 * PR4b: los 4 bancos están registrados (Santander desde PR4a; BancoEstado,
 * Banco de Chile y BCI se agregan acá — mismo orden que Excel, design.md
 * decisión #6). Pedir normalización de un banco no registrado retorna el
 * mismo `EstructuraPdfInvalidaError` "sin configuración" que
 * `PdfjsStructureValidatorService` usa para el caso análogo.
 */
export class PdfjsTransactionNormalizerService implements IPdfTransactionNormalizer {
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

  async normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      ReadonlyArray<Transaccion>,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    const estructura = this.estructurasPorBanco.get(banco);
    if (!estructura) {
      return Result.fail(
        new EstructuraPdfInvalidaError(banco, [
          {
            tipo: 'AnclaFaltante',
            ancla: '(sin configuración de normalización para este banco)',
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
    const tokens = extraido.getValue();

    const validado = evaluarEstructura(tokens, estructura, banco);
    if (validado.isFail()) {
      return Result.fail(validado.getError());
    }

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructura,
      validado.getValue().periodo,
    );
    if (resultado.isFail()) {
      return Result.fail(resultado.getError());
    }
    return Result.ok(resultado.getValue());
  }
}
