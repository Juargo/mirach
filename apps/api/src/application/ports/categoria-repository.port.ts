import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { Patron } from './patron-repository.port';

/**
 * CategoriaConPatrones — forma de lectura de una categoría con sus patrones
 * anidados, para el catálogo CRUD (US-038, CAT038-02/03). Una categoría sin
 * patrones se representa con `patrones: []` (CA-03), nunca `undefined`.
 */
export interface CategoriaConPatrones {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: Bucket;
  readonly patrones: Patron[];
  /**
   * CAT039-01 — all-history count of the CALLER's OWN transacciones
   * referencing this category. Produced in SQL, scoped in SQL
   * (RNF-SEC-006). 0 for a category created one moment ago. Required, not
   * optional: a missing producer is a compile error, not an `undefined` on
   * the wire.
   */
  readonly transaccionesCount: number;
}

/**
 * ICategoriaRepository — port de persistencia, grained por recurso (D-04,
 * SOLID ISP), para el CRUD de categorías (US-038, CAT038-01…04/07).
 *
 * Cada método recibe `userId` como PARÁMETRO — nunca como estado de
 * constructor: los repositorios son singletons compartidos por request y
 * deben permanecer tenant-stateless (ADR-036 D-03). Toda consulta y
 * mutación DEBE filtrar por `userId` en la cláusula SQL `WHERE`
 * (RNF-SEC-006), nunca en memoria.
 */
export interface ICategoriaRepository {
  listarConPatrones(userId: string): Promise<CategoriaConPatrones[]>;

  buscarPorId(userId: string, id: string): Promise<CategoriaConPatrones | null>;

  /** Comparación case-insensitive, userId-scoped; `excluirId` habilita la auto-exclusión en PATCH. */
  existeNombre(
    userId: string,
    nombre: string,
    excluirId?: string,
  ): Promise<boolean>;

  /**
   * `bucket` viaja como NOMBRE validado (`Necesidades`/`Deseos`/`Ahorro`),
   * nunca como el id físico — el use case no puede resolver `BUCKET_IDS`
   * (vive en `infrastructure/persistence/`, fuera del alcance de
   * `application`, ADR-005). El adapter resuelve `BUCKET_IDS[bucket]` antes
   * de escribir la columna física `bucketId`.
   *
   * `crearConPatrones` REEMPLAZA al `crear()` anterior (design.md D-01,
   * CAT038-10) — crear una categoría sin patrones es simplemente esta misma
   * llamada con `patrones: []`. Un único método ⇒ un único statement Prisma
   * (`categoria.create` con `patrones: { create: [...] }` anidado) ⇒ un
   * único implicit transaction: si CUALQUIER patrón fallara la escritura,
   * NADA se persiste (all-or-nothing, CAT038-10). `prioridad` viaja YA
   * resuelta por el caller (`validarPatron`, default 100) — este port nunca
   * la re-calcula.
   */
  crearConPatrones(
    userId: string,
    data: {
      nombre: string;
      bucket: string;
      patrones: ReadonlyArray<{
        patron: string;
        matchType: string;
        prioridad: number;
      }>;
    },
  ): Promise<CategoriaConPatrones>;

  /**
   * `bucket` presente en `patch` ⇒ el adapter DEBE re-stampear
   * `Transaccion.bucketId` en la MISMA transacción (D-07). Su ausencia
   * significa que el bucket no cambió — no dispara re-stamp. Mismo
   * comentario que en `crear`: viaja como nombre, se resuelve en el adapter.
   */
  actualizar(
    userId: string,
    id: string,
    patch: { nombre?: string; bucket?: string },
  ): Promise<CategoriaConPatrones>;

  /**
   * Los patrones de la categoría cascadean junto con ella, todo-o-nada
   * (US-039, CAT038-04 as modified). NO existe rechazo por "en uso": el
   * delete SIEMPRE succeeds cuando la categoría es del caller. Ver
   * PrismaCategoriaRepository#eliminar para el contrato children-first +
   * composite-FK del que depende esta garantía.
   */
  eliminar(
    userId: string,
    id: string,
  ): Promise<Result<void, CategoriaNoEncontradaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CATEGORIA_REPOSITORY = 'ICategoriaRepository';
