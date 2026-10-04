/**
 * ConfirmacionEliminacionInvalidaError — error de dominio.
 *
 * `DELETE /api/cuenta` exige la confirmación explícita `"ELIMINAR"` en el
 * body. Cualquier otro valor (ausente, otra capitalización, espacios) rechaza
 * sin borrar nada. Mensaje fijo, sin interpolar el input.
 */
export class ConfirmacionEliminacionInvalidaError extends Error {
  constructor() {
    super('Para eliminar tu cuenta escribí ELIMINAR como confirmación.');
    this.name = 'ConfirmacionEliminacionInvalidaError';
  }
}
