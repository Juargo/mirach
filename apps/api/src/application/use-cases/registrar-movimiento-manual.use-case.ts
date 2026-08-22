import { Result } from '../../shared/result';
import { MovimientoManual } from '../../domain/value-objects/movimiento-manual';
import { Bucket } from '../../domain/value-objects/bucket';
import { MovimientoManualInvalidoError } from '../../domain/errors/movimiento-manual-invalido.error';
import { CategoriaFueraDeCatalogoError } from '../../domain/errors/categoria-fuera-de-catalogo.error';
import { BucketCategoriaNoConcuerdaError } from '../../domain/errors/bucket-categoria-no-concuerda.error';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import type { IRegistrarMovimientoManualWriter } from '../ports/registrar-movimiento-manual.port';
import type { ICategoriaRepository } from '../ports/categoria-repository.port';
import type { ILogger } from '../ports/logger.port';

/**
 * Comando de entrada del use case (D-11) — discriminated union on `tipo`.
 *
 * Distinct name from `RegistrarMovimientoManualInput` (the port's writer
 * input type) to avoid collision: both have different shapes and roles.
 *
 * - Variant `tipo: 'Ingreso'` — NO `bucket`, NO `categoriaId`.
 *   Ingreso is classified by construction (D-10).
 * - Variant `tipo: 'Gasto'`  — `bucket: Bucket` and `categoriaId: string`
 *   are REQUIRED. Both must pass the catalog cascade (D-11, step 3).
 *
 * `monto` is received as a positive decimal string (BigInt-safe) — the
 * conversion and overflow guard happen in `MovimientoManual.crear` (D-01-a).
 * `fecha` is already parsed from the ISO `YYYY-MM-DD` HTTP layer.
 * `clock` is injectable for tests (default: `() => new Date()`).
 */
export type RegistrarMovimientoManualCommand =
  | {
      readonly userId: string;
      readonly tipo: 'Ingreso';
      readonly fecha: Date;
      readonly descripcion: string;
      readonly monto: string;
      readonly clock?: () => Date;
    }
  | {
      readonly userId: string;
      readonly tipo: 'Gasto';
      readonly fecha: Date;
      readonly descripcion: string;
      readonly monto: string;
      readonly bucket: Bucket;
      readonly categoriaId: string;
      readonly clock?: () => Date;
    };

/**
 * RegistrarMovimientoManualError — unión cerrada de errores posibles (D-09).
 *
 * - `MovimientoManualInvalidoError`   : datos de entrada inválidos (VO layer)
 * - `CategoriaFueraDeCatalogoError`   : Gasto con categoriaId ∉ catálogo propio
 * - `BucketCategoriaNoConcuerdaError` : Gasto con bucket incorrecto para esa categoría
 * - `PersistenciaFallidaError`        : fallo de infraestructura
 */
export type RegistrarMovimientoManualError =
  | MovimientoManualInvalidoError
  | CategoriaFueraDeCatalogoError
  | BucketCategoriaNoConcuerdaError
  | PersistenciaFallidaError;

/**
 * RegistrarMovimientoManualUseCase — orquesta el registro de un único
 * movimiento introducido a mano (US-058, D-11).
 *
 * Algoritmo (D-11, binding):
 *   1. `MovimientoManual.crear(...)` → fail-fast en datos inválidos.
 *   2. `writer.asegurarCuentaManual(userId)` → fail en error de persistencia.
 *   3. (solo Gasto) cargar catálogo con inner try/catch; validar pertenencia
 *      y bucket-match; devolver el error de dominio correspondiente.
 *   4. Resolver `{ bucketFinal, categoriaIdFinal }`:
 *        Ingreso → `{Bucket.Ingreso, null}` BY CONSTRUCTION (D-10)
 *        Gasto   → `{requestedBucket, categoriaId}`
 *   5. `writer.registrar(...)` → single Transaccion.create.
 *   6. `Result.ok({ id, vo })` — the VO is returned so the route can build
 *      the response DTO without a DB read-back (T-16/D-08).
 *
 * El cuerpo completo está envuelto en un outer try/catch (D-09): cualquier
 * throw inesperado se convierte en `Result.fail(PersistenciaFallidaError)`.
 * NUNCA relanza. NUNCA escribe Ingesta rows (D-09).
 * NUNCA invoca CategorizarTransaccionUseCase (D-10 — Ingreso se clasifica
 * por construcción; Gasto recibe bucket explícito del caller).
 */
export class RegistrarMovimientoManualUseCase {
  constructor(
    private readonly writer: IRegistrarMovimientoManualWriter,
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: RegistrarMovimientoManualCommand,
  ): Promise<
    Result<{ id: string; vo: MovimientoManual }, RegistrarMovimientoManualError>
  > {
    try {
      // ── 1. Build and validate the VO ────────────────────────────────────
      const voResult = MovimientoManual.crear({
        tipo: input.tipo,
        fecha: input.fecha,
        descripcion: input.descripcion,
        monto: input.monto,
        clock: input.clock,
      });

      if (voResult.isFail()) {
        return Result.fail(voResult.getError());
      }

      const vo = voResult.getValue();

      // ── 2. Ensure per-user sentinel account ─────────────────────────────
      const asegurarResult = await this.writer.asegurarCuentaManual(
        input.userId,
      );

      if (asegurarResult.isFail()) {
        this.logger.debug(
          'registrar-movimiento-manual: asegurarCuentaManual falló',
          { errorName: asegurarResult.getError().name },
        );
        return Result.fail(asegurarResult.getError());
      }

      const { accountId } = asegurarResult.getValue();

      // ── 3. Gasto: catalog validation (inner try/catch) ──────────────────
      let bucketFinal: Bucket;
      let categoriaIdFinal: string | null;

      if (input.tipo === 'Gasto') {
        // Both are required on the Gasto variant — no assertions needed.
        const requestedBucket = input.bucket;
        const requestedCategoriaId = input.categoriaId;

        let categorias;
        try {
          categorias = await this.categoriaRepository.listarConPatrones(
            input.userId,
          );
        } catch (error) {
          // Port contract: bare Promise (throws on infra fault), not Result.
          // Wrap in PersistenciaFallidaError (mirror commit-ingesta.use-case.ts:265-285).
          this.logger.debug(
            'registrar-movimiento-manual: listarConPatrones lanzó — fail-closed',
            { errorName: error instanceof Error ? error.name : 'UnknownError' },
          );
          return Result.fail(
            new PersistenciaFallidaError(
              'no se pudo cargar el catálogo de categorías del usuario',
              error instanceof Error ? error : undefined,
            ),
          );
        }

        // Build membership set and bucket-lookup map (mirror commit-ingesta.use-case.ts:301-311)
        const categoriaIds = new Set<string>(categorias.map((cat) => cat.id));
        const bucketPorCategoria = new Map<string, Bucket>(
          categorias.map((cat) => [cat.id, cat.bucket]),
        );

        if (!categoriaIds.has(requestedCategoriaId)) {
          return Result.fail(
            new CategoriaFueraDeCatalogoError(requestedCategoriaId),
          );
        }

        const bucketDeLaCategoria =
          bucketPorCategoria.get(requestedCategoriaId);
        if (bucketDeLaCategoria !== requestedBucket) {
          return Result.fail(
            new BucketCategoriaNoConcuerdaError(
              requestedCategoriaId,
              requestedBucket,
            ),
          );
        }

        bucketFinal = requestedBucket;
        categoriaIdFinal = requestedCategoriaId;
      } else {
        // ── 4. Ingreso: classify by construction (D-10) ─────────────────────
        // CategorizarTransaccionUseCase is NOT invoked — Ingreso is always
        // Bucket.Ingreso with no categoría.
        bucketFinal = Bucket.Ingreso;
        categoriaIdFinal = null;
      }

      // ── 5. Persist ───────────────────────────────────────────────────────
      const registrarResult = await this.writer.registrar({
        userId: input.userId,
        accountId,
        transaccion: vo.transaccion,
        bucket: bucketFinal,
        categoriaId: categoriaIdFinal,
      });

      if (registrarResult.isFail()) {
        this.logger.debug('registrar-movimiento-manual: registrar falló', {
          errorName: registrarResult.getError().name,
        });
        return Result.fail(registrarResult.getError());
      }

      // ── 6. Return VO + id ─────────────────────────────────────────────────
      // The VO is returned so the route can call aRegistrarMovimientoManualResponseDto(vo, id)
      // without a DB read-back (T-16/D-08): vo.transaccion.descripcion is the plaintext string
      // already in memory — no decrypt round-trip needed.
      return Result.ok({ id: registrarResult.getValue().id, vo });
    } catch (error) {
      // Outer safety net (D-09): translate any unexpected throw into a
      // PersistenciaFallidaError. The use case NEVER re-throws.
      this.logger.error(
        'registrar-movimiento-manual: error inesperado capturado por outer try/catch',
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
      );
      return Result.fail(
        new PersistenciaFallidaError(
          'error inesperado al registrar movimiento manual',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
