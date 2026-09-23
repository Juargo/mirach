import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
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
import { RowIndexFueraDeRangoError } from '../../domain/errors/row-index-fuera-de-rango.error';
import { CategoriaFueraDeCatalogoError } from '../../domain/errors/categoria-fuera-de-catalogo.error';
import { EdicionesInvalidasError } from '../../domain/errors/ediciones-invalidas.error';
import { IngestaDemoSoloLecturaError } from '../../domain/errors/ingesta-demo-solo-lectura.error';
import type { IFileReader } from '../ports/file-reader.port';
import type { IAccountRepository } from '../ports/account-repository.port';
import type { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import type {
  ICategoriaRepository,
  CategoriaConPatrones,
} from '../ports/categoria-repository.port';
import type { IRegistrarIngestaFallidaWriter } from '../ports/registrar-ingesta-fallida.port';
import type { ILogger } from '../ports/logger.port';
import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import type { TransaccionAPersistir } from '../ports/ingesta-repository.port';
import {
  BUCKET_POR_DEFECTO,
  seleccionarCategoriaPorDefecto,
  type CategoriaPorDefecto,
} from '../services/categoria-por-defecto';

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

/**
 * CommitEdit — a single classification override from the client overlay.
 * Received by CommitIngestaUseCase already parsed (parsing happens at the
 * infra boundary — PR4). (D-02/D-03)
 */
export interface CommitEdit {
  readonly rowIndex: number;
  readonly categoriaId: string | null;
}

/** Input for CommitIngestaUseCase.execute. */
export interface CommitIngestaInput {
  readonly fileReader: IFileReader;
  readonly userId: string;
  /** Demo gate (issue #500) — una sesión demo no puede escribir. */
  readonly esDemo: boolean;
  /** Parsed, shape-valid overlay (edits). Empty array = commit with no overrides. */
  readonly edits: ReadonlyArray<CommitEdit>;
  /** Password opcional para desbloquear un PDF cifrado (design.md D-08). */
  readonly password?: string;
}

/**
 * CommitIngestaResult — the in-memory result of a successful commit.
 * transacciones[] is built from the pre-persist retained array; NOT sourced
 * from a post-persist DB query (`persistirProcesada` returns only {ingestaId,total},
 * no rowIndex→transaccionId bridge — design §5.2b/D-11).
 */
export interface CommitIngestaResult {
  readonly ingestaId: string;
  readonly totalTransacciones: number;
  readonly duplicadosOmitidos: number;
  readonly transacciones: ReadonlyArray<{
    readonly fecha: Date;
    readonly descripcion: string;
    readonly cargo: bigint;
    readonly abono: bigint;
    /** Domain enum — NOT the physical FK. The DTO mapper converts to string. */
    readonly bucket: Bucket | null;
    readonly categoriaId: string | null;
  }>;
}

/**
 * CommitIngestaError — exhaustive union of errors produced by this use case (D-18).
 * Used by the route's `aCommitHttpError` for exhaustive `never` guard.
 */
export type CommitIngestaError =
  // Demo gate (403, issue #500)
  | IngestaDemoSoloLecturaError
  // Pipeline errors (400)
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError
  | PdfProtegidoError
  | EstructuraPdfInvalidaError
  | RangoFechasInvalidoError
  | SinMovimientosError
  // Overlay-validation errors (400)
  | EdicionesInvalidasError
  | RowIndexFueraDeRangoError
  | CategoriaFueraDeCatalogoError
  // Catálogo disponible pero incompleto (409, issue #778 tramo 3/5)
  | CatalogoIncompletoError
  // Infrastructure errors (500)
  | CategorizacionFallidaError
  | PersistenciaFallidaError;

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * CommitIngestaUseCase — the ONLY writer in the preview → commit split (US-057).
 *
 * Algorithm (D-11):
 *   1. Shared pipeline (EjecutarPipelineIngestaUseCase) → {banco, estructura,
 *      transacciones: filas (pre-dedup), nombreArchivo}. Pipeline failure →
 *      FALLIDA + return fail (D-18).
 *   2. ensure() — write: create/find Account for this user+bank. (D-01/7b)
 *   3. DetectarDuplicadosUseCase → split into nuevas (non-dup) + duplicadas count. (CMT-02)
 *   4. Load categories (listarConPatrones) — REQUIRED (membership + bucket map; D-10/D-15).
 *      Throws are wrapped in PersistenciaFallidaError via INNER try/catch; NO FALLIDA.
 *   5. Load patterns (ICatalogoClasificacion.findAll) — REQUIRED (auto-classify; D-10).
 *      Failure → CategorizacionFallidaError; NO FALLIDA.
 *   6. Both loads required — either failure → commit fails, persists nothing (D-10 fail-closed).
 *   6b. Resolve categoriaPorDefecto (#778) from the SAME categories list —
 *      `null` here means the catalog IS available but is missing the
 *      `Desconocido` of BUCKET_POR_DEFECTO (#778 tramo 3/5): commit fails
 *      with `CatalogoIncompletoError` (409), persists nothing. Distinct from
 *      step 6's catalog-DOWN fail-closed — this is a config error, not infra.
 *   7. Build Map<categoriaId, Bucket> from categories (D-15 overlay bucket lookup).
 *   8. Validate ALL overlay rowIndex against [0, filas.length) BEFORE classification (D-04/5a).
 *      Any out-of-range or duplicate index → RowIndexFueraDeRangoError 400; nothing persisted.
 *   9. Validate overlay categoriaId ∈ listarConPatrones id set (D-10) → 400.
 *  10. Auto-classify each surviving (non-dup) row via CategorizarTransaccionUseCase. (D-11 step 5)
 *  11. Apply overlay in-memory — bucket from Map<categoriaId,Bucket> (D-15, NOT re-classification).
 *  12. Build TransaccionAPersistir[] array; RETAIN in local variable for the result.
 *  13. PersistTransactionsUseCase.execute (single write, atomic, D-11).
 *  14. Build CommitIngestaResult from retained array (§5.2b — NOT a post-persist DB query).
 *
 * Error-handling (D-18):
 *   - OUTER try/catch: backstop for unexpected mid-flight throws AFTER the pipeline succeeded.
 *     Registers FALLIDA + returns PersistenciaFallidaError.
 *   - INNER try/catch (step 4): wraps listarConPatrones throw → PersistenciaFallidaError.
 *     NO FALLIDA.
 *   - Overlay-validation 400s and catalog-down: NO FALLIDA.
 *
 * Never throws — returns Result<CommitIngestaResult, CommitIngestaError>.
 */
export class CommitIngestaUseCase {
  constructor(
    /** Shared front pipeline: ingest→detect→validate→normalize (D-01). */
    private readonly ejecutarPipelineUseCase: EjecutarPipelineIngestaUseCase,
    /** Write port: ensure() creates/finds Account for this user+bank (D-01/7b). */
    private readonly accountRepository: IAccountRepository,
    /** Re-runs dedup against CURRENT DB state at commit time (CMT-02). */
    private readonly detectarDuplicadosUseCase: DetectarDuplicadosUseCase,
    /** Patterns for auto-classification — REQUIRED, fail-closed (D-10). */
    private readonly catalogoClasificacion: ICatalogoClasificacion,
    /** ALL own categories (membership + bucket map) — REQUIRED, fail-closed (D-10/D-15). */
    private readonly categoriaRepository: ICategoriaRepository,
    /** Per-row auto-classifier. */
    private readonly categorizarTransaccionUseCase: CategorizarTransaccionUseCase,
    /** Single write architecture: commit uses this intermediary (D-11/8a). */
    private readonly persistTransactionsUseCase: PersistTransactionsUseCase,
    /** Single writer of FALLIDA entries (US-004). */
    private readonly ingestaFallidaWriter: IRegistrarIngestaFallidaWriter,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: CommitIngestaInput,
  ): Promise<Result<CommitIngestaResult, CommitIngestaError>> {
    // Demo gate (issue #500) — corta ANTES de tocar el pipeline: ni
    // siquiera se registra un intento FALLIDA para una sesión demo.
    if (input.esDemo) {
      return Result.fail(new IngestaDemoSoloLecturaError());
    }

    // OUTER backstop — catches unexpected mid-flight explosions AFTER pipeline succeeds.
    // If we reach here before the pipeline completes, we still try to register FALLIDA
    // using input.fileReader.getOriginalName() (same fallback as ProcessIngestaUseCase).
    let pipelineSucceeded = false;
    let nombreArchivoFallback: string | undefined;

    try {
      nombreArchivoFallback = input.fileReader.getOriginalName();
    } catch {
      // If getOriginalName itself throws (pathological), we proceed; FALLIDA will use ''
      nombreArchivoFallback = '';
    }

    try {
      return await this.runCommit(input, (pipelineSuccess: boolean) => {
        pipelineSucceeded = pipelineSuccess;
      });
    } catch (error) {
      // Mid-flight explosion after pipeline succeeded → register FALLIDA
      if (pipelineSucceeded) {
        await this.registrarFallo(
          input.userId,
          nombreArchivoFallback ?? '',
          'fallo inesperado durante el commit de ingesta',
        );
      }
      const persistErr = new PersistenciaFallidaError(
        'fallo inesperado durante el commit de ingesta',
        error instanceof Error ? error : undefined,
      );
      return Result.fail(persistErr);
    }
  }

  private async runCommit(
    input: CommitIngestaInput,
    markPipelineSucceeded: (v: boolean) => void,
  ): Promise<Result<CommitIngestaResult, CommitIngestaError>> {
    // ── 1. Shared front pipeline ──────────────────────────────────────────────
    const pipelineResult = await this.ejecutarPipelineUseCase.execute({
      fileReader: input.fileReader,
      password: input.password,
    });
    if (pipelineResult.isFail()) {
      const error = pipelineResult.getError();
      // D-09 carve-out: a locked/wrong-password PDF is a validation error,
      // NOT a failed ingesta — it must NOT appear in the ingesta history.
      // Every OTHER pipeline failure still registers FALLIDA as before.
      if (!(error instanceof PdfProtegidoError)) {
        await this.registrarFallo(
          input.userId,
          input.fileReader.getOriginalName(),
          error.message,
        );
      }
      return Result.fail(error);
    }
    const {
      banco,
      transacciones: filas,
      nombreArchivo,
    } = pipelineResult.getValue();

    // Mark pipeline succeeded so the outer catch knows to register FALLIDA on explosion
    markPipelineSucceeded(true);

    // ── 2. Validate ALL overlay rowIndex values — BEFORE any DB round-trip (D-04/5a) ──
    // This is a pure function of `filas.length` and the edits; it needs no catalog.
    // Running it FIRST means an invalid request never costs an ensure/dedup/catalog
    // round-trip (D-11 step 3a is satisfied — validation still precedes classification;
    // hoisting it ahead of the catalog loads is a safe optimization, same fail-closed 400).
    const vistosRowIndex = new Set<number>();
    for (const edit of input.edits) {
      if (vistosRowIndex.has(edit.rowIndex)) {
        return Result.fail(
          new RowIndexFueraDeRangoError(
            edit.rowIndex,
            filas.length,
            'duplicado',
          ),
        );
      }
      vistosRowIndex.add(edit.rowIndex);
      if (edit.rowIndex < 0 || edit.rowIndex >= filas.length) {
        return Result.fail(
          new RowIndexFueraDeRangoError(
            edit.rowIndex,
            filas.length,
            'fuera-de-rango',
          ),
        );
      }
    }

    // ── 3. ensure() — create/find Account ────────────────────────────────────
    const accountResult = await this.accountRepository.ensure(
      input.userId,
      banco,
    );
    if (accountResult.isFail()) {
      return Result.fail(accountResult.getError());
    }
    const { accountId } = accountResult.getValue();

    // ── 3. Dedup against current DB state ─────────────────────────────────────
    const dedupeResult = await this.detectarDuplicadosUseCase.execute({
      accountId,
      transacciones: filas,
    });
    if (dedupeResult.isFail()) {
      return Result.fail(dedupeResult.getError());
    }
    const { nuevas, duplicadas: duplicadosOmitidos } = dedupeResult.getValue();

    // ── 4. Load categories (listarConPatrones) — INNER try/catch, NO FALLIDA ──
    let categorias: CategoriaConPatrones[];
    try {
      categorias = await this.categoriaRepository.listarConPatrones(
        input.userId,
      );
    } catch (error) {
      // listarConPatrones throws on infra fault (port contract: bare Promise, not Result)
      // Wrap in PersistenciaFallidaError, NO FALLIDA (D-18 inner layer)
      this.logger.debug(
        'commit-ingesta: listarConPatrones threw — fail-closed',
        {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      );
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo cargar el catálogo de categorías del usuario',
          error instanceof Error ? error : undefined,
        ),
      );
    }

    // ── 5. Load patterns (findAll) — REQUIRED, fail-closed ────────────────────
    const patronesResult = await this.catalogoClasificacion.findAll(
      input.userId,
    );
    if (patronesResult.isFail()) {
      this.logger.debug('commit-ingesta: findAll falló — fail-closed', {
        errorName: patronesResult.getError().name,
      });
      return Result.fail(patronesResult.getError());
    }
    const patrones = patronesResult.getValue();

    // ── 6. Build Map<categoriaId, Bucket> for overlay bucket lookup (D-15) ────
    const bucketPorCategoria = new Map<string, Bucket>(
      categorias.map((cat) => [cat.id, cat.bucket]),
    );
    const categoriaIds = new Set<string>(categorias.map((cat) => cat.id));

    // ── 6b. Categoría por defecto (#778) — misma lista ya cargada en el paso
    // 4, sin query nueva: `seleccionarCategoriaPorDefecto` es la ÚNICA fuente
    // de verdad de "cuál es la Desconocido de BUCKET_POR_DEFECTO".
    //
    // #778 tramo 3/5: llegar hasta acá ya prueba que el catálogo está
    // DISPONIBLE (el paso 4 no lanzó y el paso 5 no falló) — así que un
    // `null` acá es, por eliminación, un catálogo INCOMPLETO (falta esa fila),
    // nunca una caída de infraestructura. Rechaza ANTES de tocar el overlay o
    // persistir nada (D-10 fail-closed, mismo espíritu que el resto de esta
    // sección).
    //
    // La reasignación a `categoriaPorDefecto: CategoriaPorDefecto` (tipo NO
    // nullable) es deliberada: TODO el código más abajo que la use tipa
    // `.id` directo, sin `?.`/`??`/guard — si alguien reintrodujera la vieja
    // rama `{ SinCategoria, null }` tendría que declarar una variable NUEVA
    // (`CategoriaPorDefecto | null`) para hacerlo, porque este binding ya no
    // admite `null` en su tipo. Comprobado: `tsc --strict` NO marca
    // `categoriaPorDefecto === null` como error aunque el tipo no incluya
    // `null` (los operadores `===`/`??` contra el literal `null` están
    // exceptuados del chequeo "no overlap" de TypeScript) — la garantía acá
    // es de LECTURA/revisión de código, no del compilador; por eso este
    // comentario documenta explícitamente por qué las dos ramas de abajo
    // (antes de este cambio, líneas ~404-436) ya son inalcanzables: ambas
    // dependían de `categoriaPorDefecto === null`, y ese caso ahora
    // RECHAZA el commit entero arriba, antes de que el `.map()` de abajo
    // exista siquiera.
    const categoriaPorDefectoResult =
      seleccionarCategoriaPorDefecto(categorias);
    if (categoriaPorDefectoResult === null) {
      return Result.fail(new CatalogoIncompletoError(BUCKET_POR_DEFECTO));
    }
    const categoriaPorDefecto: CategoriaPorDefecto = categoriaPorDefectoResult;

    // ── 7. Validate overlay categoriaId ∈ own category set (D-10, RNF-SEC-006) ─
    for (const edit of input.edits) {
      if (edit.categoriaId !== null && !categoriaIds.has(edit.categoriaId)) {
        return Result.fail(new CategoriaFueraDeCatalogoError(edit.categoriaId));
      }
    }

    // ── 10–11. Build overlay Map<rowIndex, CommitEdit> for surviving (nuevas) rows ─
    // Build an overlay map keyed by rowIndex for O(1) lookup.
    const overlayPorRowIndex = new Map<number, CommitEdit>(
      input.edits.map((e) => [e.rowIndex, e]),
    );

    // The index of each `nueva` in `nuevas` corresponds to its position in `filas`
    // after dedup partitioning. We need the original filas rowIndex for each nueva.
    // DetectarDuplicadosUseCase preserves order and filters — so we compute original
    // indices by matching each nueva against filas (by reference or natural key).
    // Simplest: iterate filas, track which are duplicates, assign rowIndex.
    const nuevasSet = new Set(nuevas);
    const rowIndexDeNuevas: number[] = [];
    for (let i = 0; i < filas.length; i++) {
      if (nuevasSet.has(filas[i])) {
        rowIndexDeNuevas.push(i);
      }
    }

    // ── 12. Apply the two product rulings + auto-classify → TransaccionAPersistir[] ─
    //
    // Overlay-application rules (product decisions, 2026-08-21 — see D-11):
    //
    //   Rule 2 (Ingreso is IMMUTABLE): a row satisfying the Ingreso rule
    //     (abono > 0 && cargo === 0) ALWAYS persists { Ingreso, null }. ANY overlay
    //     on it (null OR non-null categoriaId) is silently IGNORED — not an error
    //     (advisory-overlay doctrine, consistent with preview giving Ingreso rows a
    //     null, non-editable suggestion). Checked FIRST, so it wins over the overlay.
    //
    //   Rule 1 (overlay null = DES-CLASIFICAR): a non-Ingreso row with an overlay
    //     whose categoriaId is null persists in the DEFAULT destination (#778):
    //     the `Desconocido` category of BUCKET_POR_DEFECTO — the
    //     auto-classification result is DISCARDED for that row (no auto bucket
    //     fallback). Reasoning: a user who explicitly clears a suggestion is
    //     literally saying "I don't know what this is" — which is exactly what
    //     `Desconocido` means. #778 tramo 3/5: the historical `{ SinCategoria,
    //     null }` fail-safe for a MISSING default category is GONE — step 6b
    //     above rejects the whole commit with `CatalogoIncompletoError` before
    //     ever reaching this map, so `categoriaPorDefecto` is guaranteed
    //     non-null here (compiler-enforced, see step 6b).
    //
    //   Non-null overlay: bucket from the Map<categoriaId, Bucket> (D-15). If the
    //     overlay's categoriaId were somehow absent from that map (defensive —
    //     step 7/D-10 already validated it against the caller's own set), it
    //     degrades to the SAME default destination as Rule 1 (same non-null
    //     guarantee).
    //   No overlay: auto-classify (SinCategoria stays a real FK, D-11/j;
    //     the classifier itself now resolves the #778 default on no-match).
    //
    // Cross-tenant validation (D-10, step 7 above) already ran GLOBALLY over every
    // overlay entry BEFORE this per-row loop — a foreign categoriaId 400s even when
    // it targets an Ingreso row (global validation, per-row application).
    const transaccionesAPersistir: TransaccionAPersistir[] = nuevas.map(
      (tx, idx) => {
        // Rule 2: Ingreso is immutable — overlay ignored, never re-derived.
        if (tx.esIngreso()) {
          return { transaccion: tx, bucket: Bucket.Ingreso, categoriaId: null };
        }

        const rowIndex = rowIndexDeNuevas[idx];
        const overlay = overlayPorRowIndex.get(rowIndex);

        if (overlay !== undefined) {
          if (overlay.categoriaId === null) {
            // Rule 1: DES-CLASIFICAR — descarta la sugerencia automática,
            // persiste el destino por defecto (#778). `categoriaPorDefecto`
            // YA NO puede ser `null` en este punto: el guard del paso 6b
            // (`CatalogoIncompletoError`) lo garantiza más arriba y su tipo
            // (`CategoriaPorDefecto`, no `| null`) ya no lo permite —
            // reabrir la vieja rama `{ SinCategoria, null }` exigiría
            // declarar una variable nueva tipada `| null` a propósito, no
            // solo un `if`; ver el comentario del paso 6b para el detalle de
            // por qué esto es una garantía de revisión, no del compilador.
            return {
              transaccion: tx,
              bucket: BUCKET_POR_DEFECTO,
              categoriaId: categoriaPorDefecto.id,
            };
          }
          // Non-null overlay: bucket from the category map (D-15), not
          // re-classification. The categoriaId is guaranteed in the map by
          // the D-10 validation gate above — this branch is defensive and
          // should be unreachable in practice. Same guarantee as Rule 1:
          // `categoriaPorDefecto` is non-nullable here, so this can only
          // ever fall back to the #778 default, never the retired
          // SinCategoria fail-safe.
          const bucketDelOverlay = bucketPorCategoria.get(overlay.categoriaId);
          if (bucketDelOverlay === undefined) {
            return {
              transaccion: tx,
              bucket: BUCKET_POR_DEFECTO,
              categoriaId: categoriaPorDefecto.id,
            };
          }
          return {
            transaccion: tx,
            bucket: bucketDelOverlay,
            categoriaId: overlay.categoriaId,
          };
        }

        // No overlay — auto-classify. SinCategoria stays as Bucket.SinCategoria (not null)
        // because commit always resolves classification pre-persist (D-11/j).
        // The classifier itself resolves the #778 default on no-match now.
        const autoResult = this.categorizarTransaccionUseCase
          .execute(tx, patrones, categoriaPorDefecto)
          .getValue();

        return {
          transaccion: tx,
          bucket: autoResult.bucket, // Bucket.SinCategoria is a real FK via aPersistencia
          categoriaId: autoResult.categoria?.id ?? null,
        };
      },
    );

    // ── 13. Persist via PersistTransactionsUseCase (single write, D-11) ────────
    const persistResult = await this.persistTransactionsUseCase.execute({
      userId: input.userId,
      accountId,
      banco: banco.banco,
      nombreArchivo,
      transacciones: transaccionesAPersistir,
      duplicadosOmitidos,
    });
    if (persistResult.isFail()) {
      return Result.fail(persistResult.getError());
    }
    const { ingestaId, total } = persistResult.getValue();

    this.logger.debug('commit-ingesta: pipeline completado', {
      banco: banco.banco,
      ingestaId,
      total,
      duplicadosOmitidos,
    });

    // ── 14. Build CommitIngestaResult from the retained pre-persist array (§5.2b) ─
    return Result.ok({
      ingestaId,
      totalTransacciones: total,
      duplicadosOmitidos,
      transacciones: transaccionesAPersistir.map((entry) => ({
        fecha: entry.transaccion.fecha,
        descripcion: entry.transaccion.descripcion,
        cargo: entry.transaccion.cargo,
        abono: entry.transaccion.abono,
        bucket: entry.bucket,
        categoriaId: entry.categoriaId,
      })),
    });
  }

  /**
   * registrarFallo — island-style FALLIDA registration (mirrors ProcessIngestaUseCase).
   * Never throws; a registration failure only logs without changing the commit Result.
   */
  private async registrarFallo(
    userId: string,
    nombreArchivo: string,
    motivo: string,
  ): Promise<void> {
    try {
      const res = await this.ingestaFallidaWriter.registrar({
        userId,
        nombreArchivo,
        motivo,
      });
      if (res.isFail()) {
        this.logger.error(
          'commit-ingesta: no se pudo registrar el intento fallido (degradando)',
          { errorName: res.getError().constructor.name },
        );
      }
    } catch (error) {
      this.logger.error(
        'commit-ingesta: registrarFallo lanzó inesperadamente (degradando)',
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
      );
    }
  }
}
