import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { ReevaluarDemoSoloLecturaError } from '../../domain/errors/reevaluar-demo-solo-lectura.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { IReevaluarCategoriasReader } from '../ports/reevaluar-categorias-reader.port';
import { IReevaluarCategoriasWriter } from '../ports/reevaluar-categorias-writer.port';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { ILogger } from '../ports/logger.port';

/** Unión de errores de `ReevaluarCategoriasUseCase`. */
export type ReevaluarCategoriasError =
  | ReevaluarDemoSoloLecturaError
  | CategorizacionFallidaError;

/** Salida de la reevaluación: conteos, nunca datos de transacciones. */
export interface ReevaluarCategoriasResult {
  /** Total de transacciones del usuario evaluadas en esta corrida. */
  readonly transaccionesEvaluadas: number;
  /** Filas cuya categoría/bucket efectivamente cambió y se escribió. */
  readonly transaccionesActualizadas: number;
}

/**
 * ReevaluarCategoriasUseCase — re-corre `CategorizarTransaccionUseCase` con
 * el catálogo de patrones ACTUAL del usuario sobre TODAS sus transacciones
 * persistidas (`POST /api/transacciones/reevaluar`).
 *
 * Alcance (decidido y confirmado, no reinterpretar): TODAS las transacciones
 * del usuario autenticado — categorizadas o no, sin filtro de período.
 *
 * Semántica por fila (CRÍTICO):
 *   - Clasificación DETERMINADA (matcheó un patrón, o aplicó la regla
 *     Ingreso) → se escribe, SOBRESCRIBIENDO lo que hubiera antes.
 *   - `Bucket.SinCategoria` (ningún patrón matcheó) → la fila se deja
 *     EXACTAMENTE como está. Sin este corte, un catálogo de patrones
 *     incompleto vaciaría a SinCategoria todo lo que hoy tiene una
 *     categoría asignada.
 *
 * Además, una fila cuya clasificación determinada COINCIDE con su
 * `categoriaIdActual`/`bucketActual` no se re-envía al writer — evita
 * updates no-op y hace que `transaccionesActualizadas` cuente cambios
 * REALES, no filas re-escritas con el mismo valor.
 *
 * Demo gate: una sesión demo corta ANTES de tocar catálogo, reader o writer
 * (mismo patrón que `EliminarMovimientoManualUseCase`/`ProcessIngestaUseCase`).
 *
 * Un fallo al cargar el catálogo aborta la operación completa (a diferencia
 * de la isla degradable de `ProcessIngestaUseCase`): esta es una acción
 * explícita disparada por el usuario, no un paso best-effort de un pipeline
 * de ingesta — sin catálogo confiable, reevaluar podría escribir resultados
 * incompletos silenciosamente. Nunca lanza: retorna `Result.fail` con el
 * mismo `CategorizacionFallidaError` que produjo el reader del catálogo.
 */
export class ReevaluarCategoriasUseCase {
  constructor(
    private readonly catalogoClasificacion: ICatalogoClasificacion,
    private readonly reader: IReevaluarCategoriasReader,
    private readonly writer: IReevaluarCategoriasWriter,
    private readonly categorizarTransaccionUseCase: CategorizarTransaccionUseCase,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    /** Demo gate — una sesión demo no puede escribir. */
    esDemo: boolean;
  }): Promise<Result<ReevaluarCategoriasResult, ReevaluarCategoriasError>> {
    if (input.esDemo) {
      return Result.fail(new ReevaluarDemoSoloLecturaError());
    }

    const catalogResult = await this.catalogoClasificacion.findAll(
      input.userId,
    );
    if (catalogResult.isFail()) {
      return Result.fail(catalogResult.getError());
    }
    const patrones = catalogResult.getValue();

    const transacciones = await this.reader.findTodasDelUsuario(input.userId);

    const aEscribir: Array<{
      transaccionId: string;
      categoriaId: string | null;
      bucket: Bucket;
    }> = [];

    for (const t of transacciones) {
      const { categoria, bucket } = this.categorizarTransaccionUseCase
        .execute(
          { descripcion: t.descripcion, cargo: t.cargo, abono: t.abono },
          patrones,
        )
        .getValue();

      // Ningún patrón matcheó → la fila NO se toca (crítico, ver docstring).
      if (bucket === Bucket.SinCategoria) continue;

      const categoriaId = categoria?.id ?? null;

      // Sin cambio real → no re-enviar al writer (evita updates no-op).
      if (categoriaId === t.categoriaIdActual && bucket === t.bucketActual) {
        continue;
      }

      aEscribir.push({ transaccionId: t.id, categoriaId, bucket });
    }

    const writeResult = await this.writer.escribir(input.userId, aEscribir);
    if (writeResult.isFail()) {
      return Result.fail(writeResult.getError());
    }

    const resultado = {
      transaccionesEvaluadas: transacciones.length,
      transaccionesActualizadas: writeResult.getValue().actualizadas,
    };

    // Solo conteos — nunca descripción/montos/categoría por fila (ADR-013).
    this.logger.debug('reevaluar-categorias: reevaluation outcome', resultado);

    return Result.ok(resultado);
  }
}
