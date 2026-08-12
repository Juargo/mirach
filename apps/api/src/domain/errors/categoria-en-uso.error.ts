/**
 * CategoriaEnUsoError — error de dominio.
 *
 * Se produce cuando `DELETE /api/categorias/:id` se llama sobre una
 * categoría referenciada por al menos una `Transaccion` (cualquier
 * período). El mensaje apunta a reasignar esas transacciones primero — NO
 * promete un flujo de migración/reasignación automática, que es US-039
 * (non-goal explícito de este cambio). Ver design.md D-06, §5.3, CAT038-04.
 */
export class CategoriaEnUsoError extends Error {
  /** The original category id, for server-side logging only. */
  readonly categoriaId: string;

  constructor(categoriaId: string) {
    super(
      'La categoría tiene transacciones asociadas. Reasigná esas transacciones a otra categoría antes de eliminarla.',
    );
    this.name = 'CategoriaEnUsoError';
    this.categoriaId = categoriaId;
  }
}
