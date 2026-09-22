import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { CategoriaPorDefecto } from '../services/categoria-por-defecto';

/**
 * ICatalogoClasificacion — port de aplicación (lectura de catálogo).
 *
 * Carga todos los patrones de clasificación del `userId` dueño del catálogo
 * (US-037: el catálogo es per-user, no global). La implementación Prisma los
 * lee en memoria una vez por llamada de ingesta (decisión 3).
 *
 * Contrato: retorna Result y NUNCA lanza. Un catálogo vacío (sin patrones) es
 * un resultado válido (ok con array vacío); solo errores estructurales retornan fail.
 */
export interface ICatalogoClasificacion {
  findAll(
    userId: string,
  ): Promise<
    Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>
  >;

  /**
   * buscarCategoriaPorDefecto (#778) — resuelve la categoría `Desconocido`
   * del bucket por defecto (`BUCKET_POR_DEFECTO`, ver
   * `application/services/categoria-por-defecto.ts`) para este `userId`.
   *
   * Existe como método SEPARADO de `findAll` porque `ProcessIngestaUseCase`
   * solo carga PATRONES (no categorías) por esta vía — a diferencia de
   * `CommitIngestaUseCase`, que ya tiene el catálogo completo de categorías
   * vía `ICategoriaRepository.listarConPatrones` y por eso NO usa este
   * método, sino que llama directo a `seleccionarCategoriaPorDefecto` sobre
   * esa lista (DRY: una sola función decide "cuál es la categoría por
   * defecto", este método solo la resuelve contra la BD).
   *
   * Contrato: retorna Result y NUNCA lanza. `Result.ok(null)` es válido
   * (el usuario todavía no tiene esa fila — usuarios previos a #738); solo
   * errores estructurales retornan fail. El caller degrada un `fail` igual
   * que degrada hoy un catálogo no disponible: no rompe la ingesta.
   */
  buscarCategoriaPorDefecto(
    userId: string,
  ): Promise<Result<CategoriaPorDefecto | null, CategorizacionFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CATALOGO_CLASIFICACION = 'ICatalogoClasificacion';
