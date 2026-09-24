import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfProtegidoError } from '../../domain/errors/pdf-protegido.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { SinMovimientosError } from '../../domain/errors/sin-movimientos.error';
import { CatalogoIncompletoError } from '../../domain/errors/catalogo-incompleto.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { IngestaDemoSoloLecturaError } from '../../domain/errors/ingesta-demo-solo-lectura.error';
import { IFileReader } from '../ports/file-reader.port';
import { DetectedBank } from '../ports/bank-detector.port';
import { IAccountRepository } from '../ports/account-repository.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { ITransaccionBucketWriter } from '../ports/transaccion-bucket-writer.port';
import { ITransaccionParaClasificarReader } from '../ports/transaccion-para-clasificar.port';
import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { IRegistrarIngestaFallidaWriter } from '../ports/registrar-ingesta-fallida.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { ILogger } from '../ports/logger.port';
import {
  BUCKET_POR_DEFECTO,
  CategoriaPorDefecto,
} from '../services/categoria-por-defecto';

/** Entrada del orquestador: el archivo subido/leído y el usuario dueño de la cuenta. */
export interface ProcessIngestaInput {
  fileReader: IFileReader;
  userId: string;
  /** Demo gate (issue #500) — una sesión demo no puede escribir. */
  esDemo: boolean;
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

/**
 * Unión de los errores que puede producir cualquier paso del pipeline.
 *
 * Incluye `PdfProtegidoError` (design.md D-02) aunque `ProcessIngestaInput`
 * NO gana un campo `password` — el endpoint one-shot (deprecado) deja pasar
 * el error tal cual (mejor mensaje, "protegido" en vez de "inválido") pero
 * sin forma de desbloquearlo en un solo request. La unión se declara acá
 * para que `instanceof PdfProtegidoError` en `aHttpError` (Phase 8.6) narre
 * correctamente contra el tipo — la estructura de `PdfProtegidoError` sin
 * esto YA satisface estructuralmente `PdfInvalidoError` (ambos son
 * subtipos de `Error` sin campos extra en `PdfInvalidoError`), así que el
 * compilador no fuerza este widening por sí solo; se declara explícito por
 * corrección e intención, no porque `tsc` lo exija.
 */
export type ProcessIngestaError =
  | IngestaDemoSoloLecturaError
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | PersistenciaFallidaError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError
  | PdfProtegidoError
  | EstructuraPdfInvalidaError
  | RangoFechasInvalidoError
  | SinMovimientosError
  | CatalogoIncompletoError
  | CategorizacionFallidaError;

/**
 * ProcessIngestaUseCase — orquesta el pipeline completo de ingesta:
 *   IngestFile → DetectBank → AccountRepository.ensure
 *     → ValidateStructure → NormalizeTransactions → ResolverCatálogo
 *     → PersistTransactionsUseCase
 *     → CategorizarTransacciones (post-persist, degradable SOLO si falla el
 *       WRITER de buckets)
 *
 * CLI y HTTP comparten genuinamente este único pipeline. Cualquier fallo
 * en cualquier paso hasta persistir corta la cadena y retorna Result.fail.
 * El paso de categorización (post-persist) es un "try/catch island", pero
 * YA NO absorbe un catálogo caído (issue #778 tramo 5a) — lo único que
 * sigue degradando ahí es el WRITER de buckets fallando DESPUÉS de que las
 * transacciones ya fueron persistidas (ahí ya no existe la opción de
 * "rechazar": las filas ya existen en BD).
 *
 * #778 tramo 3/5: resolver la categoría por defecto (`Desconocido` de
 * `BUCKET_POR_DEFECTO`) YA NO es parte de esa isla — se hace ANTES de
 * persistir (`runPipeline`, tras el dedup) precisamente porque, si el
 * catálogo está DISPONIBLE pero incompleto (sin esa fila), la ingesta tiene
 * que RECHAZAR (`CatalogoIncompletoError`, 409) sin escribir nada: el tramo
 * 5 elimina `Bucket.SinCategoria`, así que un catálogo incompleto ya no
 * tiene destino de degradación.
 *
 * #778 tramo 5a: un catálogo CAÍDO (fallo de infraestructura —
 * `findAll`/`buscarCategoriaPorDefecto` de `ICatalogoClasificacion`
 * devuelven `Result.fail`) TAMBIÉN rechaza ahora, con
 * `CategorizacionFallidaError` (503, transitorio/reintentable), ANTES de
 * persistir nada — ni siquiera las filas de Ingreso. Antes de este tramo,
 * esa caída degradaba: se escribían solo las filas de Ingreso y el resto
 * quedaba `bucketId = null` "pendiente de reintento". Esa isla se elimina
 * porque nada rescata de forma confiable un `bucketId` nulo que después no
 * matchea ningún patrón (con dinero de por medio, una ingesta a medias es
 * peor que ninguna — ver `apps/api/CLAUDE.md`).
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
    /** US-057 D-01: shared front pipeline (ingest→detect→validate→normalize). */
    private readonly ejecutarPipelineUseCase: EjecutarPipelineIngestaUseCase,
    private readonly accountRepository: IAccountRepository,
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
    // Demo gate (issue #500) — corta ANTES de tocar el pipeline: ni
    // siquiera se registra un intento FALLIDA para una sesión demo.
    if (input.esDemo) {
      return Result.fail(new IngestaDemoSoloLecturaError());
    }

    try {
      const result = await this.runPipeline(input);
      if (result.isFail()) {
        // NO hay carve-out D-09 acá (a diferencia de CommitIngestaUseCase) —
        // decisión deliberada: `ProcessIngestaInput` no gana un campo
        // `password` (D-02), así que un PDF protegido en el endpoint
        // one-shot deprecado tiene EXACTAMENTE un intento por request, sin
        // reintentos posibles ni pila de filas FALLIDA acumulándose. Hoy ya
        // registra ese archivo como inválido; no hay pollution que evitar.
        // Trigger YAGNI: si `POST /ingestas` alguna vez gana el campo
        // password, el carve-out de D-09 se traslada acá.
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
    // US-057 D-01: delegate the shared front (ingest→detect→validate→normalize)
    // to EjecutarPipelineIngestaUseCase. ensure() + dedup + persist tail stay here.
    const pipelineResult = await this.ejecutarPipelineUseCase.execute({
      fileReader: input.fileReader,
    });
    if (pipelineResult.isFail()) {
      return Result.fail(pipelineResult.getError());
    }
    const { banco, estructura, transacciones, nombreArchivo } =
      pipelineResult.getValue();

    // archivo shape for the result response (originalName + sizeInBytes + extension
    // were available from the shared pipeline's archive; reconstruct minimally).
    const archivo = {
      originalName: nombreArchivo,
      // sizeInBytes: kept for backward compat with ProcessIngestaResult; read from
      // fileReader directly since EjecutarPipelineIngestaUseCase doesn't return it.
      sizeInBytes: input.fileReader.getSizeInBytes(),
      // Case-insensitive: uppercase extensions (`.PDF`) must still resolve. The
      // Extension VO already guaranteed only .xlsx/.pdf reached this far, so the
      // else branch is safely .xlsx.
      extension: input.fileReader
        .getOriginalName()
        .toLowerCase()
        .endsWith('.pdf')
        ? '.pdf'
        : '.xlsx',
    };

    const accountResult = await this.accountRepository.ensure(
      input.userId,
      banco,
    );
    if (accountResult.isFail()) {
      return Result.fail(accountResult.getError());
    }
    const { accountId } = accountResult.getValue();

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

    // --- Resolver catálogo de clasificación ANTES de persistir (#778 tramo 3/5/5a) ---
    //
    // Se adelanta acá — y ya NO dentro de `runCategorizacion` (post-persist) —
    // porque CUALQUIER fallo al resolver el catálogo (caído O incompleto)
    // tiene que RECHAZAR sin escribir nada: el tramo 5 elimina
    // `Bucket.SinCategoria`, así que ya no queda ningún destino de
    // degradación disponible.
    //
    // Tramo 5a (issue #778): un catálogo CAÍDO (`findAll` devuelve
    // `Result.fail`, fallo de infraestructura) rechaza igual que uno
    // incompleto. Antes de este tramo degradaba: se escribían solo las
    // filas de Ingreso y el resto quedaba `bucketId = null` "pendiente de
    // reintento" — esa isla queda eliminada (ver `apps/api/CLAUDE.md`).
    const catalogResult = await this.catalogoClasificacion.findAll(
      input.userId,
    );
    if (catalogResult.isFail()) {
      return Result.fail(catalogResult.getError());
    }
    const patrones = catalogResult.getValue();

    // Categoría por defecto (#778) — misma consulta puntual del catálogo. Un
    // fallo ESTRUCTURAL acá (`Result.fail`, la consulta en sí falló) es la
    // MISMA clase de caída de infraestructura que `findAll` de arriba —
    // mismo rechazo (tramo 5a), no una degradación distinta.
    const categoriaPorDefectoResult =
      await this.catalogoClasificacion.buscarCategoriaPorDefecto(input.userId);
    if (categoriaPorDefectoResult.isFail()) {
      return Result.fail(categoriaPorDefectoResult.getError());
    }
    const categoriaPorDefectoEncontrada = categoriaPorDefectoResult.getValue();
    if (categoriaPorDefectoEncontrada === null) {
      // Catálogo DISPONIBLE pero INCOMPLETO: la consulta respondió `null`
      // porque el usuario no tiene la `Desconocido` de `BUCKET_POR_DEFECTO`
      // (Gustos). Rechazo adelantado — nada se persiste todavía en este
      // punto del pipeline. Distinto del rechazo de arriba: este es un error
      // de CONFIGURACIÓN (409), no de infraestructura (503).
      return Result.fail(new CatalogoIncompletoError(BUCKET_POR_DEFECTO));
    }
    const categoriaPorDefecto: CategoriaPorDefecto =
      categoriaPorDefectoEncontrada;

    // US-057 D-11: wrap each nueva row as TransaccionAPersistir with
    // bucket: null, categoriaId: null — byte-for-byte identical persisted result
    // to pre-retype (aPersistencia maps null bucket → bucketId: null).
    // Post-persist runCategorizacion island resolves the real bucket via ITransaccionBucketWriter.
    const persistResult = await this.persistTransactionsUseCase.execute({
      userId: input.userId,
      accountId,
      banco: banco.banco,
      nombreArchivo,
      transacciones: nuevas.map((tx) => ({
        transaccion: tx,
        bucket: null,
        categoriaId: null,
      })),
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
      patrones,
      categoriaPorDefecto,
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
   * Categorización post-persistencia (best-effort SOLO ante fallo del WRITER).
   *
   * `patrones` y `categoriaPorDefecto` ya vienen resueltos por `runPipeline`
   * ANTES de persistir (#778 tramo 3/5/5a): un catálogo incompleto (409) o
   * CAÍDO (503, tramo 5a) rechaza la ingesta entera más arriba, sin escribir
   * nada — este método nunca ve ninguno de los dos casos.
   * `categoriaPorDefecto` llega siempre resuelto (tipo NO nullable): la rama
   * `null → SinCategoria` de `CategorizarTransaccionUseCase` es un CENTINELA
   * exclusivo de `ReevaluarCategoriasUseCase` ("no matcheó"), no se usa acá.
   *
   * Única isla degradable que queda (issue #778 tramo 5a): el WRITER de
   * buckets falla DESPUÉS de que las transacciones YA fueron persistidas —
   * ahí "rechazar" ya no es una opción (las filas existen en BD), así que
   * quedan con bucketId=null y el usuario las recupera vía
   * `reevaluar-categorias` (si después matchean un patrón).
   *
   * Retorna el resumen opcional (undefined si algo impide terminar).
   *
   * @param userId - dueño de las transacciones a categorizar (US-037:
   *   catálogo per-user; ya resuelto aguas arriba, solo threading acá).
   */
  private async runCategorizacion(
    ingestaId: string,
    userId: string,
    patrones: ReadonlyArray<PatronClasificacion>,
    categoriaPorDefecto: CategoriaPorDefecto,
  ): Promise<CategorizacionResumen | undefined> {
    try {
      // 2. Leer transacciones persistidas de ESTA ingesta (scope isolation R-07)
      const txsParaClasificar =
        await this.txParaClasificarReader.findParaClasificar(ingestaId);

      if (txsParaClasificar.length === 0) {
        this.logger.debug('process-ingesta: categorization pass completed', {
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
            categoriaPorDefecto,
          )
          .getValue();
        return {
          transaccionId: tx.id,
          categoriaId: categoria?.id ?? null,
          bucket,
        };
      });

      // 4. El catálogo ya está garantizado disponible (rechazado más arriba
      // si no lo estaba, tramo 5a) — TODO se escribe. SinCategoria es un
      // estado definitivo, no "pendiente".
      const sinCategoria = clasificadas.filter(
        (a) => a.bucket === Bucket.SinCategoria,
      ).length;

      // 5. Escribir categoría+bucket en BD, atómico por lote (fallo → deja
      // null, log + continúa — ÚNICA isla degradable que queda, ver
      // docblock del método). ingestaId threads through for structural
      // scope isolation (RNF-SEC-006).
      const writeResult =
        await this.transaccionBucketWriter.asignarCategorizacion(
          userId,
          ingestaId,
          clasificadas,
        );
      if (writeResult.isFail()) {
        this.logger.error(
          'no se pudieron escribir los buckets de categorización (degradando)',
          { errorName: writeResult.getError().constructor.name },
        );
        return undefined;
      }

      // Aggregate del pase de categorización — nunca descripción/montos de
      // las transacciones clasificadas, solo conteos (ADR-013).
      this.logger.debug('process-ingesta: categorization pass completed', {
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
