import { MatchType } from '../../domain/value-objects/patron-clasificacion';

/**
 * Patron — forma de lectura de un patrón de clasificación, para el
 * catálogo CRUD (US-038). `categoriaId` es redundante cuando el patrón
 * viaja anidado dentro de `CategoriaConPatrones`, y se mantiene igual para
 * que exista una única forma de `Patron` (design.md §7.1).
 */
export interface Patron {
  readonly id: string;
  readonly categoriaId: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly prioridad: number;
}

/**
 * IPatronRepository — port de persistencia, grained por recurso (D-04,
 * SOLID ISP), para el CRUD de patrones de clasificación (US-038,
 * CAT038-05/07).
 *
 * Cada método recibe `userId` como PARÁMETRO — nunca como estado de
 * constructor: los repositorios son singletons compartidos por request y
 * deben permanecer tenant-stateless (ADR-036 D-03). Toda consulta y
 * mutación DEBE filtrar por `userId` en la cláusula SQL `WHERE`
 * (RNF-SEC-006), nunca en memoria.
 */
export interface IPatronRepository {
  buscarPorId(userId: string, id: string): Promise<Patron | null>;

  /** Comparación case-insensitive, userId-scoped; `excluirId` habilita la auto-exclusión en PATCH. */
  existePatron(
    userId: string,
    patron: string,
    excluirId?: string,
  ): Promise<boolean>;

  crear(
    userId: string,
    data: {
      categoriaId: string;
      patron: string;
      matchType: MatchType;
      prioridad: number;
    },
  ): Promise<Patron>;

  actualizar(
    userId: string,
    id: string,
    patch: { patron?: string; matchType?: MatchType; prioridad?: number },
  ): Promise<Patron>;

  /** `false` ⇒ el patrón no existe o no pertenece al usuario (anti-enumeration). */
  eliminar(userId: string, id: string): Promise<boolean>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const PATRON_REPOSITORY = 'IPatronRepository';
