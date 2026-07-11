import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { IFileReader } from '../ports/file-reader.port';
import { DetectedBank } from '../ports/bank-detector.port';
import { IAccountRepository } from '../ports/account-repository.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';

/** Entrada del orquestador: el archivo subido/leído y el usuario dueño de la cuenta. */
export interface ProcessIngestaInput {
  fileReader: IFileReader;
  userId: string;
}

/** Salida agregada: todo lo que CLI/HTTP necesitan para reportar el resultado. */
export interface ProcessIngestaResult {
  archivo: { originalName: string; sizeInBytes: number; extension: string };
  banco: DetectedBank;
  estructura: { filaEncabezados: number; totalFilasDatos: number };
  ingestaId: string;
  total: number;
  transacciones: ReadonlyArray<Transaccion>;
}

/** Unión de los errores que puede producir cualquier paso del pipeline. */
export type ProcessIngestaError =
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | PersistenciaFallidaError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError;

/**
 * ProcessIngestaUseCase — orquesta el pipeline completo de ingesta:
 *   IngestFile → DetectBank → AccountRepository.ensure
 *     → ValidateStructure → NormalizeTransactions → PersistTransactionsUseCase
 *
 * Pensado para que CLI y HTTP compartan este único pipeline (antes CLI
 * encadenaba manualmente hasta normalizar y HTTP solo llegaba a IngestFile).
 * Por ahora solo el CLI lo usa; conectar IngestaController a este orquestador
 * queda para la siguiente porción (PR4). Cualquier fallo en cualquier paso
 * corta la cadena y retorna Result.fail con un error descriptivo; solo el
 * paso de persistencia puede dejar una Ingesta FALLIDA (los pasos previos no
 * crean fila de Ingesta). NUNCA lanza — cualquier excepción de un
 * colaborador se captura y se traduce a Result.fail.
 */
export class ProcessIngestaUseCase {
  constructor(
    private readonly ingestFileUseCase: IngestFileUseCase,
    private readonly detectBankUseCase: DetectBankUseCase,
    private readonly accountRepository: IAccountRepository,
    private readonly validateStructureUseCase: ValidateStructureUseCase,
    private readonly normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
    private readonly persistTransactionsUseCase: PersistTransactionsUseCase,
  ) {}

  async execute(
    input: ProcessIngestaInput,
  ): Promise<Result<ProcessIngestaResult, ProcessIngestaError>> {
    try {
      return await this.runPipeline(input);
    } catch (error) {
      // Defensivo: un colaborador (adapters ExcelJS/Prisma) puede lanzar en
      // lugar de retornar Result. NUNCA propagamos — el motivo es fijo y
      // genérico a propósito: el mensaje crudo del error podría contener
      // datos sensibles (p. ej. un monto leído de una celda). La causa se
      // conserva aparte, sin interpolarla en el mensaje.
      return Result.fail(
        new PersistenciaFallidaError(
          'fallo inesperado durante el pipeline de ingesta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  private async runPipeline(
    input: ProcessIngestaInput,
  ): Promise<Result<ProcessIngestaResult, ProcessIngestaError>> {
    const ingestResult = this.ingestFileUseCase.execute(input.fileReader);
    if (ingestResult.isFail()) {
      return Result.fail(ingestResult.getError());
    }
    const archivo = ingestResult.getValue();

    const detectResult = await this.detectBankUseCase.execute(
      archivo.buffer,
      archivo.originalName,
    );
    if (detectResult.isFail()) {
      return Result.fail(detectResult.getError());
    }
    const banco = detectResult.getValue();

    const accountResult = await this.accountRepository.ensure(input.userId, banco);
    if (accountResult.isFail()) {
      return Result.fail(accountResult.getError());
    }
    const { accountId } = accountResult.getValue();

    const validateResult = await this.validateStructureUseCase.execute(
      archivo.buffer,
      banco.banco,
    );
    if (validateResult.isFail()) {
      return Result.fail(validateResult.getError());
    }
    const estructura = validateResult.getValue();

    const normalizeResult = await this.normalizeTransactionsUseCase.execute(
      archivo.buffer,
      banco.banco,
    );
    if (normalizeResult.isFail()) {
      return Result.fail(normalizeResult.getError());
    }
    const transacciones = normalizeResult.getValue();

    const persistResult = await this.persistTransactionsUseCase.execute({
      accountId,
      banco: banco.banco,
      nombreArchivo: archivo.originalName,
      transacciones,
    });
    if (persistResult.isFail()) {
      return Result.fail(persistResult.getError());
    }
    const { ingestaId, total } = persistResult.getValue();

    return Result.ok({
      archivo: {
        originalName: archivo.originalName,
        sizeInBytes: archivo.sizeInBytes,
        extension: archivo.extension,
      },
      banco,
      estructura: {
        filaEncabezados: estructura.filaEncabezados,
        totalFilasDatos: estructura.totalFilasDatos,
      },
      ingestaId,
      total,
      transacciones,
    });
  }
}
