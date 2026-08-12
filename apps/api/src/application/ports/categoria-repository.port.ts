import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaEnUsoError } from '../../domain/errors/categoria-en-uso.error';
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

  crear(
    userId: string,
    data: { nombre: string; bucketId: string },
  ): Promise<CategoriaConPatrones>;

  /**
   * `bucketId` presente en `patch` ⇒ el adapter DEBE re-stampear
   * `Transaccion.bucketId` en la MISMA transacción (D-07). Su ausencia
   * significa que el bucket no cambió — no dispara re-stamp.
   */
  actualizar(
    userId: string,
    id: string,
    patch: { nombre?: string; bucketId?: string },
  ): Promise<CategoriaConPatrones>;

  /**
   * Los patrones de la categoría cascadean junto con ella; el rechazo por
   * "en uso" es atómico con el predicado dentro del propio statement de
   * borrado (D-06) — nunca un check-then-delete.
   */
  eliminar(
    userId: string,
    id: string,
  ): Promise<Result<void, CategoriaNoEncontradaError | CategoriaEnUsoError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CATEGORIA_REPOSITORY = 'ICategoriaRepository';
