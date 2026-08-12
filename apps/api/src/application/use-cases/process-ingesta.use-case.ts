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
import { IAccountRepository } from '../ports/account-repository.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { ITransaccionBucketWriter } from '../ports/transaccion-bucket-writer.port';
import { ITransaccionParaClasificarReader } from '../ports/transaccion-para-clasificar.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { IRegistrarIngestaFallidaWriter } from '../ports/registrar-ingesta-fallida.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { ILogger } from '../ports/logger.port';

/** Entrada del orquestador: el archivo subido/leído y el usuario dueño de la cuenta. */
export interface ProcessIngestaInput {
  fileReader: IFileReader;
  userId: string;
}

/** Resumen opcional del paso de categorización (non-breaking). */
export interface CategorizacionResumen {
  asignadas: number;
  sinCategoria: number;
}

/** Salida agregada: todo lo que CLI/HTTP necesitan para reportar el resultado. */
export interface ProcessIngestaResult {
  archivo: { originalName: string; sizeInBytes: number; extension: string };
  banco: DetectedBank;
  estructura: { filaEncabezados: number; totalFilasDatos: number };
  ingestaId: string;
  total: number;
  transacciones: ReadonlyArray<Transaccion>;
  /** Conteo de duplicados detectados y omitidos (no persistidos) — US-005. */
  duplicadosOmitidos: number;
  categorizacion?: CategorizacionResumen;
}

/** Unión de los errores que puede producir cualquier paso del pipeline. */
export type ProcessIngestaError =
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | PersistenciaFallidaError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError
  | EstructuraPdfInvalidaError
  | RangoFechasInvalidoError;

/**
 * ProcessIngestaUseCase — orquesta el pipeline completo de ingesta:
 *   IngestFile → DetectBank → AccountRepository.ensure
 *     → ValidateStructure → NormalizeTransactions → PersistTransactionsUseCase
 *     → CategorizarTransacciones (best-effort, degradable)
 *
 * CLI y HTTP comparten genuinamente este único pipeline. Cualquier fallo
 * en cualquier paso hasta persistir corta la cadena y retorna Result.fail.
 * El paso de categorización es un "try/catch island": NUNCA falla la ingesta,
 * solo degrada los buckets a SinCategoria cuando el catálogo o el writer fallan.
 *
 * Reconciliación Ingreso (R-08): cuando el catálogo falla, se pasa [] como
 * patrones → la Ingreso rule aún corre (abono>0, cargo=0 → Ingreso). Solo
 * el matching por catálogo degrada.
 *
 * NUNCA lanza — cualquier excepción de un colaborador se captura y se traduce
 * a Result.fail (pasos hard) o se registra y degrada (paso de categorización).
 *
 * Routing PDF vs Excel (Sprint 4, sprint4-pdf-ingesta, design.md decisión #1
 * "Option B, fixed"): un único branch en `archivo.extension` DENTRO de este
 * orquestador selecciona el trio detect/validate/normalize (PDF o Excel) una
 * sola vez por ejecución — `AccountRepository.ensure` y todo lo posterior
 * (persistir → categorizar) es IDÉNTICO para ambos formatos, porque ambos
 * trios emiten la misma forma canónica (`DetectedBank`, `Transaccion[]`). Se
 * eligió branchear acá — y no en `IngestFileUseCase` (Option A) ni con un
 * adapter compuesto detrás de los ports existentes — porque los ports
 * `validate`/`normalize` no reciben el nombre del archivo: un router
 * compuesto no tendría de dónde leer la extensión.
 */
export class ProcessIngestaUseCase {
  constructor(
    private readonly ingestFileUseCase: IngestFileUseCase,
    private readonly detectBankUseCase: DetectBankUseCase,
    private readonly detectPdfBankUseCase: DetectPdfBankUseCase,
    private readonly accountRepository: IAccountRepository,
    private readonly validateStructureUseCase: ValidateStructureUseCase,
    private readonly validatePdfStructureUseCase: ValidatePdfStructureUseCase,
    private readonly normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
    private readonly normalizePdfTransactionsUseCase: NormalizePdfTransactionsUseCase,
    private readonly persistTransactionsUseCase: PersistTransactionsUseCase,
    private readonly catalogoClasificacion: ICatalogoClasificacion,
    private readonly transaccionBucketWriter: ITransaccionBucketWriter,
    private readonly categorizarTransaccionUseCase: CategorizarTransaccionUseCase,
    private readonly txParaClasificarReader: ITransaccionParaClasificarReader,
    private readonly detectarDuplicadosUseCase: DetectarDuplicadosUseCase,
    private readonly ingestaFallidaWriter: IRegistrarIngestaFallidaWriter,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: ProcessIngestaInput,
  ): Promise<Result<ProcessIngestaResult, ProcessIngestaError>> {
    try {
      const result = await this.runPipeline(input);
      if (result.isFail()) {
        await this.registrarFallo(input, result.getError().message);
      }
      // El error ORIGINAL de runPipeline se preserva verbatim — el registro
      // de la falla nunca lo reemplaza (single-writer boundary, US-004
      // design.md §3.2).
      return result;
    } catch (error) {
      // Defensivo: un colaborador (adapters ExcelJS/Prisma) puede lanzar en
      // lugar de retornar Result. NUNCA propagamos — el motivo es fijo y
      // genérico a propósito: el mensaje crudo del error podría contener
      // datos sensibles (p. ej. un monto leído de una celda). La causa se
      // conserva aparte, sin interpolarla en el mensaje.
      const persistErr = new PersistenciaFallidaError(
        'fallo inesperado durante el pipeline de ingesta',
        error instanceof Error ? error : undefined,
      );
      await this.registrarFallo(input, persistErr.message);
      return Result.fail(persistErr);
    }
  }

  /**
   * registrarFallo — boundary de registro de FALLIDA (US-004, design.md
   * §3.2). ÚNICO escritor de filas FALLIDA (single-writer-per-state, D1).
   *
   * Island: TODO el cuerpo va envuelto en try/catch (mirrors
   * `runCategorizacion`) para que este método sea ESTRUCTURALMENTE
   * never-throw, no "never-throw por suerte" — p. ej. si
   * `input.fileReader.getOriginalName()` en sí mismo lanza, tampoco debe
   * escalar. Un fallo al registrar (DB caída, o el writer devuelve
   * Result.fail) NUNCA debe cambiar el Result que ve el caller: el pedido
   * del usuario ya falló, y fallar en LOGUEAR ese intento no debe agravar el
   * error que se le devuelve.
   */
  private async registrarFallo(
    input: ProcessIngestaInput,
    motivo: string,
  ): Promise<void> {
    try {
      const res = await this.ingestaFallidaWriter.registrar({
        userId: input.userId,
        nombreArchivo: input.fileReader.getOriginalName(),
        motivo,
      });
      if (res.isFail()) {
        this.logger.error(
          'no se pudo registrar el intento fallido de ingesta (degradando)',
          { errorName: res.getError().constructor.name },
        );
      }
    } catch (error) {
      this.logger.error('registrarFallo lanzó inesperadamente (degradando)', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
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

    // Routing (design.md decisión #1): un único branch de extensión elige el
    // trio PDF o Excel. A partir de acá el pipeline es idéntico para ambos —
    // ambos trios emiten la misma forma canónica (DetectedBank, Transaccion[]).
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

    const accountResult = await this.accountRepository.ensure(
      input.userId,
      banco,
    );
    if (accountResult.isFail()) {
      return Result.fail(accountResult.getError());
    }
    const { accountId } = accountResult.getValue();

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

    // US-005: detecta duplicados contra la BD ANTES de persistir — solo
    // `nuevas` llegan a PersistTransactionsUseCase; `duplicadas` se cuenta
    // pero NUNCA se persiste. Un fallo del detector corta el pipeline
    // (conservador: si no podemos verificar, no persistimos un batch
    // potencialmente duplicado) — no se crea ninguna fila PROCESADA; el
    // boundary de este método (catch/return-fail) registra una fila FALLIDA
    // vía `ingestaFallidaWriter` (US-004, §3.2), nunca una PENDIENTE.
    const dedupeResult = await this.detectarDuplicadosUseCase.execute({
      accountId,
      transacciones,
    });
    if (dedupeResult.isFail()) {
      return Result.fail(dedupeResult.getError());
    }
    const { nuevas, duplicadas } = dedupeResult.getValue();

    const persistResult = await this.persistTransactionsUseCase.execute({
      userId: input.userId,
      accountId,
      banco: banco.banco,
      nombreArchivo: archivo.originalName,
      transacciones: nuevas,
      duplicadosOmitidos: duplicadas,
    });
    if (persistResult.isFail()) {
      return Result.fail(persistResult.getError());
    }
    const { ingestaId, total, duplicadosOmitidos } = persistResult.getValue();

    // --- Paso de categorización (try/catch island — nunca falla la ingesta) ---
    const categorizacion = await this.runCategorizacion(
      ingestaId,
      input.userId,
    );

    // `estructura` trae campos distintos por trio (Excel: filas de hoja de
    // cálculo; PDF: página + rangos X, sin conteo de filas propio — ese
    // conteo solo existe post-normalize). Se discrimina en runtime vía `in`
    // (sin `as`) para no perder chequeo de tipos: reporta el mismo par
    // {filaEncabezados, totalFilasDatos} en ambos casos, campo CLI-cosmético
    // (no viaja en el DTO HTTP — ver aIngestaResponseDto), reinterpretando
    // "filaEncabezados" como "página de inicio de tabla" para PDF.
    const estructuraResumen =
      'paginaInicioTabla' in estructura
        ? {
            filaEncabezados: estructura.paginaInicioTabla,
            totalFilasDatos: transacciones.length,
          }
        : {
            filaEncabezados: estructura.filaEncabezados,
            totalFilasDatos: estructura.totalFilasDatos,
          };

    // Resumen agregado del pipeline completo — cada paso ya loguea su propio
    // debug (detect/validate/normalize/dedupe/persist/categorizar); esta línea
    // es la ÚNICA que junta el resultado end-to-end en un solo evento
    // buscable por ingestaId. Nunca transacciones/nombreArchivo (ADR-013).
    this.logger.debug('process-ingesta: pipeline completed', {
      banco: banco.banco,
      ingestaId,
      total,
      duplicadosOmitidos,
    });

    return Result.ok({
      archivo: {
        originalName: archivo.originalName,
        sizeInBytes: archivo.sizeInBytes,
        extension: archivo.extension,
      },
      banco,
      estructura: estructuraResumen,
      ingestaId,
      total,
      // `nuevas` (no el `transacciones` crudo pre-dedup): total/transacciones
      // reflejan lo REALMENTE importado (US-005) — `estructuraResumen` arriba
      // sí usa el batch crudo porque describe la estructura del ARCHIVO, no
      // lo persistido.
      transacciones: nuevas,
      duplicadosOmitidos,
      categorizacion,
    });
  }

  /**
   * Categorización post-persistencia (best-effort).
   *
   * Flujo de degradación:
   *   - Catálogo falla → la Ingreso rule (dominio puro) TODAVÍA corre
   *     (abono>0, cargo=0 → Ingreso), pero SOLO se escriben las filas de Ingreso.
   *     El resto queda bucketId=null (pendiente/reintentable), NUNCA SinCategoria:
   *     así US-013 distingue "no se pudo consultar el catálogo" de "no matcheó".
   *   - Writer falla → deja bucketId en null en BD; log + continúa.
   *   - Cualquier excepción imprevista → captura, degrada, continúa.
   *
   * Retorna el resumen opcional (undefined si algo impide terminar).
   *
   * @param userId - dueño del catálogo a consultar (US-037: catálogo per-user,
   *   ya en scope como `input.userId` — pure threading, sin lógica nueva).
   */
  private async runCategorizacion(
    ingestaId: string,
    userId: string,
  ): Promise<CategorizacionResumen | undefined> {
    try {
      // 1. Cargar catálogo. Si falla, la Ingreso rule (dominio puro) todavía
      //    corre, pero solo se escriben filas de Ingreso; el resto queda null.
      let patrones: ReadonlyArray<PatronClasificacion> = [];
      let catalogoDisponible = true;
      const catalogResult = await this.catalogoClasificacion.findAll(userId);
      if (catalogResult.isOk()) {
        patrones = catalogResult.getValue();
      } else {
        catalogoDisponible = false;
        this.logger.error(
          'catálogo de clasificación no disponible; solo se escriben filas de Ingreso, el resto queda null',
          { errorName: catalogResult.getError().constructor.name },
        );
      }

      // 2. Leer transacciones persistidas de ESTA ingesta (scope isolation R-07)
      const txsParaClasificar =
        await this.txParaClasificarReader.findParaClasificar(ingestaId);

      if (txsParaClasificar.length === 0) {
        this.logger.debug('process-ingesta: categorization pass completed', {
          catalogoDisponible,
          asignadas: 0,
          sinCategoria: 0,
        });
        return { asignadas: 0, sinCategoria: 0 };
      }

      // 3. Clasificar cada transacción (nunca lanza, siempre retorna Result.ok)
      const clasificadas = txsParaClasificar.map((tx) => {
        const { categoria, bucket } = this.categorizarTransaccionUseCase
          .execute(
            { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
            patrones,
          )
          .getValue();
        return { transaccionId: tx.id, categoria, bucket };
      });

      // 4. Elegir qué escribir:
      //    - catálogo disponible → todo (SinCategoria es estado definitivo).
      //    - catálogo caído → solo filas de Ingreso; el resto queda null (pendiente).
      const asignaciones = catalogoDisponible
        ? clasificadas
        : clasificadas.filter((a) => a.bucket === Bucket.Ingreso);

      // SinCategoria solo se cuenta con el catálogo disponible: en la degradación
      // las filas no escritas no son SinCategoria, son null pendiente.
      const sinCategoria = catalogoDisponible
        ? clasificadas.filter((a) => a.bucket === Bucket.SinCategoria).length
        : 0;

      // 5. Escribir categoría+bucket en BD, atómico por fila (fallo → deja
      // null, log + continúa). ingestaId threads through for structural
      // scope isolation (RNF-SEC-006).
      const writeResult =
        await this.transaccionBucketWriter.asignarCategorizacion(
          userId,
          ingestaId,
          asignaciones,
        );
      if (writeResult.isFail()) {
        this.logger.error(
          'no se pudieron escribir los buckets de categorización (degradando)',
          { errorName: writeResult.getError().constructor.name },
        );
        return undefined;
      }

      // Aggregate del pase de categorización — nunca descripción/montos de
      // las transacciones clasificadas, solo conteos + el flag de
      // degradación (ADR-013).
      this.logger.debug('process-ingesta: categorization pass completed', {
        catalogoDisponible,
        asignadas: writeResult.getValue().actualizadas,
        sinCategoria,
      });
      return { asignadas: writeResult.getValue().actualizadas, sinCategoria };
    } catch {
      // Cualquier excepción imprevista en la isla de categorización no propaga.
      // Raw error is NOT logged — it may contain Prisma SQL/table details or
      // sensitive amounts from transaction data. Fixed message only.
      this.logger.error('categorización falló; ingesta continúa PROCESADA');
      return undefined;
    }
  }
}
