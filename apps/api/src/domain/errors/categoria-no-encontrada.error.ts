/**
 * CategoriaNoEncontradaError — error de dominio.
 *
 * Se produce cuando un `categoriaId` recibido (path param o referencia) no
 * corresponde a una fila del catálogo del usuario autenticado — ya sea
 * porque no existe o porque pertenece a otro usuario. Ambos casos se
 * representan con este ÚNICO error para que la respuesta HTTP no permita
 * enumerar categorías ajenas (anti-enumeration, mirrors
 * IngestaNoEncontradaError, RNF-SEC-006).
 *
 * Distinta de `CategoriaDesconocidaError` (400, categoría referenciada por
 * NOMBRE en un body que no resuelve) — ver ADR-037 y design.md §5.3: la
 * invariante "un error ⇒ exactamente un status" exige dos clases.
 */
export class CategoriaNoEncontradaError extends Error {
  /** The original categoria id, for server-side logging only. */
  readonly categoriaId: string;

  constructor(categoriaId: string) {
    super('La categoría no existe o no pertenece al usuario autenticado.');
    this.name = 'CategoriaNoEncontradaError';
    this.categoriaId = categoriaId;
  }
}
