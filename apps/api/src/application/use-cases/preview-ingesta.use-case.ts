import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
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
import { IAccountReader } from '../ports/account-reader.port';
import { ITransaccionExistenteReader } from '../ports/transaccion-existente-reader.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { rangoFechas, marcarDuplicados } from './marcar-duplicados.helper';
import { ILogger } from '../ports/logger.port';

/** Entrada del preview: archivo + usuario propietario (D-06: dedup scoped a userId). */
export interface PreviewIngestaInput {
  fileReader: IFileReader;
  userId: string;
}

/** Sugerencia de categorización por fila — null cuando no hay match o SinCategoria (D-09). */
export interface SugeridoClasificacion {
  bucket: Bucket;
  categoriaId: string | null;
}

/** Una fila del preview (D-08): la transacción de dominio más sus metadatos de dedup/sugerencia. */
export interface PreviewFila {
  rowIndex: number;
  transaccion: Transaccion;
  esDuplicado: boolean;
  sugerido: SugeridoClasificacion | null;
}

/** Resumen agregado del preview (spec PREV-EXT-01). */
export interface PreviewResumen {
  /** Conteo de filas en el archivo (PRE-dedupe, D-05). */
  totalFilas: number;
  /** Cuántas filas son duplicadas. */
  duplicadosDetectados: number;
  /** Cuántas filas serían nuevas si se confirma la ingesta. */
  nuevas: number;
}

/** Salida del preview: read model de aplicación (sin artefactos de persistencia). */
export interface PreviewIngestaResult {
  banco: DetectedBank;
  resumen: PreviewResumen;
  filas: ReadonlyArray<PreviewFila>;
}

/** Unión de errores — subconjunto de ProcessIngestaError (sin dedupe/categorización persistida). */
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
 *   EjecutarPipelineIngesta → findByBanco → (si cuenta) dedup → sugerido
 *
 * CA-04 (design §3): la garantía de "nada se persiste" es de CONSTRUCCIÓN, no
 * de runtime. El constructor acepta EXACTAMENTE los colaboradores sin
 * escritura — NO hay `IAccountRepository` (upsert ausente por tipo), ni
 * `PersistTransactionsUseCase`, ni catalogo escritor. Compárese con
 * `ProcessIngestaUseCase`/`CommitIngestaUseCase`, que sí los inyectan.
 *
 * D-06: `findByBanco` → null → todo esDuplicado:false, reader de existentes NO consultado.
 * D-07: `rangoFechas` + `buscarPorCuentaYRango` + `marcarDuplicados` cuando cuenta existe.
 * D-08: sin 50-cap — se devuelven TODAS las filas del archivo (preview completo).
 * D-09: `sugerido` por fila, `Bucket.SinCategoria` → null; Ingreso still classified on catalog-down.
 * D-17: `ITransaccionExistenteReader` recibe descripción ya descifrada — el adapter Prisma
 *       invoca `crypto.decrypt` internamente (load-bearing, ver D-17 en design.md).
 *
 * NUNCA lanza — cualquier excepción de un colaborador se captura y se traduce
 * a Result.fail (pipeline delegado a EjecutarPipelineIngestaUseCase) o se
 * degrada silenciosamente (catálogo down → Ingreso still classified, resto sugerido:null).
 */
export class PreviewIngestaUseCase {
  constructor(
    /** US-057 D-01: third caller of the shared front pipeline. */
    private readonly ejecutarPipelineUseCase: EjecutarPipelineIngestaUseCase,
    /** D-05/D-06: read-only sibling of IAccountRepository — no upsert. */
    private readonly accountReader: IAccountReader,
    /** D-07/D-17: reader of existing transactions (with decryption in adapter). */
    private readonly txExistenteReader: ITransaccionExistenteReader,
    /** D-09: catalog for classification suggestions. */
    private readonly catalogoClasificacion: ICatalogoClasificacion,
    /** D-09: per-row classifier — injected (matches ProcessIngestaUseCase pattern, not per-request new). */
    private readonly categorizarTransaccionUseCase: CategorizarTransaccionUseCase,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: PreviewIngestaInput,
  ): Promise<Result<PreviewIngestaResult, PreviewIngestaError>> {
    try {
      return await this.runPreview(input);
    } catch (error) {
      // Defensivo: un colaborador (adapters ExcelJS/pdfjs) puede lanzar en
      // lugar de retornar Result. NUNCA propagamos el mensaje crudo — podría
      // contener datos sensibles (ADR-013).
      return Result.fail(
        new PersistenciaFallidaError(
          'fallo inesperado durante la vista previa de ingesta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  private async runPreview(
    input: PreviewIngestaInput,
  ): Promise<Result<PreviewIngestaResult, PreviewIngestaError>> {
    // 1. Shared front pipeline (D-01 — faithful mirror of ProcessIngestaUseCase order)
    const pipelineResult = await this.ejecutarPipelineUseCase.execute({
      fileReader: input.fileReader,
    });
    if (pipelineResult.isFail()) {
      return Result.fail(pipelineResult.getError());
    }
    const { banco, estructura, transacciones } = pipelineResult.getValue();

    // spec PREV-EXT-01: `totalFilas` is the total row count of the normalized
    // set as reported by the structure step — same discrimination as
    // ProcessIngestaUseCase.estructuraResumen. Excel's validator reports its own
    // `totalFilasDatos` (can exceed the normalized count if some rows were
    // dropped downstream); PDF has no pre-normalize count, so it uses
    // `transacciones.length`. `duplicadosDetectados`/`nuevas` still derive from
    // the dedup mask over `transacciones`.
    const totalFilas =
      'paginaInicioTabla' in estructura
        ? transacciones.length
        : estructura.totalFilasDatos;

    // 2. Load catalog (best-effort island — D-09 degradation)
    let patrones: ReadonlyArray<PatronClasificacion> = [];
    let catalogoDisponible = true;
    const catalogResult = await this.catalogoClasificacion.findAll(
      input.userId,
    );
    if (catalogResult.isOk()) {
      patrones = catalogResult.getValue();
    } else {
      catalogoDisponible = false;
      this.logger.error(
        'preview-ingesta: catálogo no disponible; solo Ingreso rule activa',
        { errorName: catalogResult.getError().constructor.name },
      );
    }

    // 3. Dedup status per row (D-06/D-07)
    const maskResult = await this.buildDedupMask(
      input.userId,
      banco,
      transacciones,
    );
    if (maskResult.isFail()) {
      return Result.fail(maskResult.getError());
    }
    const mask = maskResult.getValue();

    // 4. Build filas — sugerido + esDuplicado per row (D-08: no cap)
    const filas: PreviewFila[] = transacciones.map((tx, i) => {
      const { bucket: bucketSugerido, categoria } =
        this.categorizarTransaccionUseCase
          .execute(
            { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
            // catalog-down: pass [] so Ingreso rule still fires (abono>0,cargo=0 → Ingreso)
            catalogoDisponible ? patrones : [],
          )
          .getValue();

      // D-09: SinCategoria → null; Ingreso/Necesidades/etc → { bucket, categoriaId }
      const sugerido: SugeridoClasificacion | null =
        bucketSugerido === Bucket.SinCategoria
          ? null
          : { bucket: bucketSugerido, categoriaId: categoria?.id ?? null };

      return {
        rowIndex: i,
        transaccion: tx,
        esDuplicado: mask[i],
        sugerido,
      };
    });

    const duplicadosDetectados = mask.filter(Boolean).length;
    const nuevas = transacciones.length - duplicadosDetectados;

    // Solo conteos + banco (enum) — nunca las transacciones ni userId (ADR-013).
    this.logger.debug('preview-ingesta: preview generated', {
      banco: banco.banco,
      totalFilas,
      duplicadosDetectados,
      nuevas,
    });

    return Result.ok({
      banco,
      resumen: {
        totalFilas,
        duplicadosDetectados,
        nuevas,
      },
      filas,
    });
  }

  /**
   * buildDedupMask — resolves per-row duplication status.
   *
   * D-06: when `findByBanco` returns null (account does not exist yet), all rows
   * are new → mask is all-false, reader is NOT queried.
   * D-07: when account exists, delegates to `rangoFechas` + `buscarPorCuentaYRango`
   * + `marcarDuplicados` (shared helpers, same natural key as DetectarDuplicadosUseCase).
   */
  private async buildDedupMask(
    userId: string,
    banco: DetectedBank,
    transacciones: ReadonlyArray<Transaccion>,
  ): Promise<Result<boolean[], PersistenciaFallidaError>> {
    if (transacciones.length === 0) {
      return Result.ok([]);
    }

    // D-06: find account by banco (read-only, no upsert)
    const accountResult = await this.accountReader.findByBanco(userId, banco);
    if (accountResult.isFail()) {
      return Result.fail(accountResult.getError());
    }
    const accountData = accountResult.getValue();

    if (accountData === null) {
      // D-06: account does not exist → all rows are new
      return Result.ok(transacciones.map(() => false));
    }

    // D-07: account exists → compute rango and query reader.
    // rangoFechas returns null only for empty input — the length guard above
    // ensures we never reach here empty (same pattern as detectar-duplicados.use-case.ts:62).
    const { desde, hasta } = rangoFechas(transacciones)!;

    const existentesResult = await this.txExistenteReader.buscarPorCuentaYRango(
      accountData.accountId,
      desde,
      hasta,
    );
    if (existentesResult.isFail()) {
      return Result.fail(existentesResult.getError());
    }

    return Result.ok(
      marcarDuplicados(existentesResult.getValue(), transacciones),
    );
  }
}
