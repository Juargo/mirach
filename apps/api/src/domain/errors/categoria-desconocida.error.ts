/**
 * CategoriaDesconocidaError — error de dominio.
 *
 * Se produce cuando un `nombre` de categoría recibido en el BODY de una
 * petición (p.ej. reclasificar una transacción, `PATCH
 * /api/transacciones/:id/categoria`) no resuelve a ninguna fila del
 * catálogo del usuario autenticado. Reemplaza al `CategoriaInvalidaError`
 * retirado junto con el enum `Categoria` (ADR-037) — el mensaje NO enumera
 * el catálogo del usuario.
 *
 * Distinta de `CategoriaNoEncontradaError` (404, categoría referenciada por
 * ID en la URL) — un mismo status ambiguo con "recurso no encontrado" sería
 * incorrecto aquí, donde la ruta referencia una transacción, no una
 * categoría. Ver ADR-037 y design.md §5.3.
 */
export class CategoriaDesconocidaError extends Error {
  /** The original raw nombre, for server-side logging only. */
  readonly nombre: string;

  constructor(nombre: string) {
    super('La categoría indicada no existe en tu catálogo.');
    this.name = 'CategoriaDesconocidaError';
    this.nombre = nombre;
  }
}
