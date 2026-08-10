import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { IFileReader } from '../ports/file-reader.port';
import { DetectedBank } from '../ports/bank-detector.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { ILogger } from '../ports/logger.port';

/** Tope de filas de muestra devueltas (CA-01, design §5.1) — cap de servidor. */
export const PREVIEW_SAMPLE_MAX = 50;

/** Entrada del preview: solo el archivo. Sin `userId` — preview no escopa por tenant. */
export interface PreviewIngestaInput {
  fileReader: IFileReader;
}

/** Salida: read model de aplicación, no un VO de dominio (sin invariante que proteger). */
export interface PreviewIngestaResult {
  banco: DetectedBank;
  /** `totalFilasDatos` es PRE-dedupe (D5): `confirm` puede importar ≤ este número tras DetectarDuplicados. */
  estructura: { totalFilasDatos: number };
  muestra: ReadonlyArray<Transaccion>;
}

/** Unión de errores — subconjunto de ProcessIngestaError (sin dedupe/categorización). */
export type PreviewIngestaError =
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError
  | EstructuraPdfInvalidaError
  | RangoFechasInvalidoError
  | PersistenciaFallidaError;

/**
 * PreviewIngestaUseCase — orquesta el seam de solo-lectura:
 *   IngestFile → esPdf branch → Detect → Validate → Normalize → slice(0, 50)
 *
 * CA-04 (design §3): la garantía de "nada se persiste" es de CONSTRUCCIÓN, no
 * de runtime. El constructor acepta EXACTAMENTE los 7 colaboradores sin
 * escritura — NO hay `IAccountRepository` (por lo tanto `ensure()` es
 * inalcanzable), ni `PersistTransactionsUseCase`, ni dedupe, ni catalogo de
 * clasificación. Compárese con `ProcessIngestaUseCase`, que sí los inyecta.
 *
 * El branch `esPdf` (detección/validación/normalización PDF vs Excel) es una
 * copia VERBATIM del de `ProcessIngestaUseCase.runPipeline`
 * (process-ingesta.use-case.ts:147) — MISMO predicado, MISMOS pares de trio,
 * sin reordenar (design §4, D4). Un reviewer debe diffear ambos bloques
 * (T1.2a): una divergencia acá haría que el preview MIENTA sobre lo que hará
 * confirm.
 *
 * `estructura.totalFilasDatos` = `transacciones.length` (post-normalize),
 * uniforme para Excel y PDF (design §5.1, D5) — el valor de `validate` se
 * descarta, validate solo corre por sus efectos de error.
 */
export class PreviewIngestaUseCase {
  constructor(
    private readonly ingestFileUseCase: IngestFileUseCase,
    private readonly detectBankUseCase: DetectBankUseCase,
    private readonly detectPdfBankUseCase: DetectPdfBankUseCase,
    private readonly validateStructureUseCase: ValidateStructureUseCase,
    private readonly validatePdfStructureUseCase: ValidatePdfStructureUseCase,
    private readonly normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
    private readonly normalizePdfTransactionsUseCase: NormalizePdfTransactionsUseCase,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: PreviewIngestaInput,
  ): Promise<Result<PreviewIngestaResult, PreviewIngestaError>> {
    try {
      return await this.runPipeline(input);
    } catch (error) {
      // Defensivo (D9): un colaborador (adapters ExcelJS/pdfjs) puede lanzar
      // en vez de retornar Result. NUNCA propagamos el mensaje crudo — podría
      // contener datos sensibles (p. ej. un monto leído de una celda). La
      // causa se conserva aparte, sin interpolarla en el mensaje.
      return Result.fail(
        new PersistenciaFallidaError(
          'fallo inesperado durante la vista previa de ingesta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  private async runPipeline(
    input: PreviewIngestaInput,
  ): Promise<Result<PreviewIngestaResult, PreviewIngestaError>> {
    const ingestResult = this.ingestFileUseCase.execute(input.fileReader);
    if (ingestResult.isFail()) {
      return Result.fail(ingestResult.getError());
    }
    const archivo = ingestResult.getValue();

    // Faithful mirror of process-ingesta.use-case.ts:147 (design §4, D4).
    const esPdf = archivo.extension === '.pdf';

    const detectResult = esPdf
      ? await this.detectPdfBankUseCase.execute(
          archivo.buffer,
          archivo.originalName,
        )
      : await this.detectBankUseCase.execute(
          archivo.buffer,
          archivo.originalName,
        );
    if (detectResult.isFail()) {
      return Result.fail(detectResult.getError());
    }
    const banco = detectResult.getValue();

    // NO accountRepository.ensure() acá — la escritura está ausente por
    // construcción (design §3.2). El seam va detect → validate directo.

    const validateResult = esPdf
      ? await this.validatePdfStructureUseCase.execute(
          archivo.buffer,
          banco.banco,
        )
      : await this.validateStructureUseCase.execute(
          archivo.buffer,
          banco.banco,
        );
    if (validateResult.isFail()) {
      return Result.fail(validateResult.getError());
    }
    // El valor de validate se descarta (design §5.1, D5): solo corre por sus
    // efectos de error (estructura/rango-fechas inválidos).

    const normalizeResult = esPdf
      ? await this.normalizePdfTransactionsUseCase.execute(
          archivo.buffer,
          banco.banco,
        )
      : await this.normalizeTransactionsUseCase.execute(
          archivo.buffer,
          banco.banco,
        );
    if (normalizeResult.isFail()) {
      return Result.fail(normalizeResult.getError());
    }
    const transacciones = normalizeResult.getValue();
    const muestra = transacciones.slice(0, PREVIEW_SAMPLE_MAX);

    // Solo conteos + banco (enum) — nunca las transacciones de la muestra.
    this.logger.debug('preview-ingesta: preview generated', {
      banco: banco.banco,
      totalFilasDatos: transacciones.length,
      muestraSize: muestra.length,
    });

    return Result.ok({
      banco,
      estructura: { totalFilasDatos: transacciones.length },
      muestra,
    });
  }
}
