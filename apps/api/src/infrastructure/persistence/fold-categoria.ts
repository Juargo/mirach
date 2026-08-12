/**
 * foldCategoria — pliega la fila `categoria` anidada que devuelve Prisma
 * (`{ select: { id: true, nombre: true } }`) a la forma de dominio
 * `{ id, nombre }` (CAT037-06, D-01).
 *
 * Tras ADR-037 (retiro del enum `Categoria`), la identidad de una categoría
 * es la fila `userId`-scoped, no un tipo de compilación — la ownership YA
 * fue probada por el `WHERE` de la query que trajo esta fila (verificado en
 * `prisma-movimientos-mes.repository.ts` y
 * `prisma-detalle-bucket.repository.ts`). Por eso este fold es TOTAL sobre
 * filas no-nulas: ya no hay un `CATEGORIA_NOMBRES.has()` que filtre por un
 * universo cerrado de nombres — ese guard nunca fue el mecanismo de
 * aislamiento y mantenerlo haría desaparecer, sin error, cualquier
 * categoría creada por el usuario (el mismo defecto que ADR-036 D-09
 * corrigió, re-armado por otro vector).
 *
 * `null`/`undefined` → `null` (Ingreso/SinCategoria, sin match) — semántica
 * sin cambios. En cualquier otro caso devuelve `{ id: categoria.id, nombre:
 * categoria.nombre }` — el id REAL de la fila.
 */
export function foldCategoria(
  categoria: { id: string; nombre: string } | null | undefined,
): { id: string; nombre: string } | null {
  if (categoria === null || categoria === undefined) return null;
  return { id: categoria.id, nombre: categoria.nombre };
}
