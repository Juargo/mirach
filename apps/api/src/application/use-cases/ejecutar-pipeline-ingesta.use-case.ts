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
import { ValidatedStructure } from '../ports/structure-validator.port';
import { EstructuraPdfValidada } from '../ports/pdf-structure-validator.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { ILogger } from '../ports/logger.port';

/**
 * Entrada del pipeline compartido: solo el archivo.
 * La cuenta, el usuario, y el dedup son responsabilidad de cada use case caller.
 */
export interface EjecutarPipelineIngestaInput {
  fileReader: IFileReader;
}

/**
 * Resultado del pipeline compartido.
 *
 * Todos los campos son necesarios para al menos un caller (D-16):
 *   - `banco`: necesario para todos los callers (ProcessIngesta, CommitIngesta, PreviewIngesta).
 *   - `estructura`: necesario para ProcessIngesta (discrimina Excel vs PDF para totalFilasDatos)
 *                   y para Preview (totalFilas = estructura.totalFilasDatos para Excel;
 *                   transacciones.length para PDF).
 *   - `transacciones`: necesario para todos los callers.
 *   - `nombreArchivo`: necesario para CommitIngesta (persistirProcesada + FALLIDA).
 */
export interface EjecutarPipelineIngestaResult {
  banco: DetectedBank;
  estructura: ValidatedStructure | EstructuraPdfValidada;
  transacciones: ReadonlyArray<Transaccion>;
  nombreArchivo: string;
}

/** Unión de errores del pipeline compartido — subconjunto de los errores de ingesta. */
export type EjecutarPipelineIngestaError =
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
 * EjecutarPipelineIngestaUseCase — extrae el frente compartido de ingesta:
 *   IngestFile → esPdf branch → Detect → Validate → Normalize
 *
 * Devuelve `{banco, estructura, transacciones, nombreArchivo}` (D-16).
 *
 * EXCLUIDO DEL PIPELINE COMPARTIDO (D-01):
 *   - `IAccountRepository.ensure()` → responsabilidad de cada caller escritor
 *     (ProcessIngestaUseCase, CommitIngestaUseCase).
 *   - Dedup → responsabilidad de cada caller (dedup scoping varía).
 *   - Categorización → responsabilidad de commit/one-shot.
 *
 * El branch PDF vs Excel (verbatim del ProcessIngestaUseCase.runPipeline,
 * design §4, D-01) garantiza que los tres callers usen el MISMO routing —
 * una divergencia acá haría que preview/commit y one-shot mintieran sobre
 * qué harían. Un reviewer debe diffear con `ProcessIngestaUseCase.runPipeline`.
 *
 * NUNCA lanza — cualquier excepción de un colaborador se captura y se traduce
 * a Result.fail con mensaje genérico (ADR-013: el mensaje crudo podría contener
 * datos sensibles).
 */
export class EjecutarPipelineIngestaUseCase {
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
    input: EjecutarPipelineIngestaInput,
  ): Promise<
    Result<EjecutarPipelineIngestaResult, EjecutarPipelineIngestaError>
  > {
    try {
      return await this.runPipeline(input);
    } catch (error) {
      // Defensivo: un colaborador (adapters ExcelJS/pdfjs) puede lanzar en
      // lugar de retornar Result. NUNCA propagamos el mensaje crudo — podría
      // contener datos sensibles (p. ej. un monto leído de una celda, ADR-013).
      return Result.fail(
        new PersistenciaFallidaError(
          'fallo inesperado durante el pipeline de ingesta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  private async runPipeline(
    input: EjecutarPipelineIngestaInput,
  ): Promise<
    Result<EjecutarPipelineIngestaResult, EjecutarPipelineIngestaError>
  > {
    const ingestResult = this.ingestFileUseCase.execute(input.fileReader);
    if (ingestResult.isFail()) {
      return Result.fail(ingestResult.getError());
    }
    const archivo = ingestResult.getValue();

    // Faithful mirror of process-ingesta.use-case.ts runPipeline branch (D-01):
    // un único predicado de extensión elige el trio PDF o Excel.
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

    // NO accountRepository.ensure() acá — cada caller lo invoca por su cuenta
    // después de recibir este resultado (D-01, ISP: el pipeline compartido no
    // tiene dependencia de escritura).

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
    const estructura = validateResult.getValue();

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

    // Solo conteos + banco (enum) — nunca transacciones (ADR-013).
    this.logger.debug('ejecutar-pipeline-ingesta: pipeline ejecutado', {
      banco: banco.banco,
      totalFilas: transacciones.length,
    });

    return Result.ok({
      banco,
      estructura,
      transacciones,
      nombreArchivo: archivo.originalName,
    });
  }
}
