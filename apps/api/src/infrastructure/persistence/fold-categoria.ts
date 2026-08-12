import { Categoria } from '../../domain/value-objects/categoria';

/**
 * CATEGORIA_NOMBRES — el set de nombres válidos de Categoria (D-09).
 *
 * Fuente única: `Object.values(Categoria)`. Se usa para validar `nombre`
 * defensivamente, nunca para resolver un id físico.
 */
const CATEGORIA_NOMBRES: ReadonlySet<string> = new Set(
  Object.values(Categoria),
);

/**
 * foldCategoria — pliega la fila `categoria` anidada que devuelve Prisma
 * (`{ select: { id: true, nombre: true } }`) a la forma de dominio
 * `{ id, nombre }` (CAT037-06, D-09).
 *
 * Reemplaza a `foldCategoriaId` (categoria-ids.ts, eliminado). La diferencia
 * de diseño es la que corrige el defecto: este fold resuelve por `nombre`
 * (la columna string que cada catálogo per-user comparte con el enum de
 * dominio, por construcción — ver design.md §5), no buscando un id físico
 * en un mapa global fijo. Bajo catálogos per-user los ids son cuids
 * generados en el momento de la copia; un fold por id siempre pliega a
 * `null` para cualquier usuario que no sea el bootstrap.
 *
 * `null`/`undefined` → `null` (Ingreso/SinCategoria, sin match) —
 * semántica sin cambios. `nombre` no reconocido como valor de `Categoria` →
 * `null` (defensive, mismo criterio que el fold de bucket). En cualquier
 * otro caso devuelve `{ id: categoria.id, nombre: categoria.nombre }` — el
 * id REAL de la fila, no un id físico fijo.
 */
export function foldCategoria(
  categoria: { id: string; nombre: string } | null | undefined,
): { id: string; nombre: Categoria } | null {
  if (categoria === null || categoria === undefined) return null;
  if (!CATEGORIA_NOMBRES.has(categoria.nombre)) return null;
  return { id: categoria.id, nombre: categoria.nombre as Categoria };
}
