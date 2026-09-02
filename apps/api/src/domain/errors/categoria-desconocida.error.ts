/**
 * CategoriaDesconocidaError — error de dominio.
 *
 * Se produce cuando un `categoriaId` recibido en el BODY de una petición
 * (p.ej. reclasificar una transacción, `PATCH
 * /api/transacciones/:id/categoria`) no resuelve a ninguna fila del
 * catálogo del usuario autenticado — no existe **o no es suya**,
 * indistinguibles (anti-enumeration). ADR-042: el contrato de
 * reclasificación pasa de `nombre` a `categoriaId` (corte duro) porque,
 * bajo unicidad per-bucket, un nombre deja de identificar una única
 * categoría. Reemplaza al `CategoriaInvalidaError` retirado junto con el
 * enum `Categoria` (ADR-037) — el mensaje NO enumera el catálogo del
 * usuario.
 *
 * Distinta de `CategoriaNoEncontradaError` (404, categoría referenciada por
 * ID en la URL) — un mismo status ambiguo con "recurso no encontrado" sería
 * incorrecto aquí, donde la ruta referencia una transacción, no una
 * categoría. Ver ADR-037, ADR-042 y design.md §5.3.
 */
export class CategoriaDesconocidaError extends Error {
  /** The original categoriaId, for server-side logging only. */
  readonly categoriaId: string;

  constructor(categoriaId: string) {
    super('La categoría indicada no existe en tu catálogo.');
    this.name = 'CategoriaDesconocidaError';
    this.categoriaId = categoriaId;
  }
}
