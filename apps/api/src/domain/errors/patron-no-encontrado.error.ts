/**
 * PatronNoEncontradoError — error de dominio.
 *
 * Se produce cuando un `id` de patrón de clasificación recibido no
 * corresponde a una fila del usuario autenticado — ya sea porque no existe
 * o porque pertenece a otro usuario. Ambos casos se representan con este
 * ÚNICO error (anti-enumeration, mirrors CategoriaNoEncontradaError,
 * RNF-SEC-006). Ver design.md §5.3, CAT038-05/07.
 */
export class PatronNoEncontradoError extends Error {
  /** The original pattern id, for server-side logging only. */
  readonly patronId: string;

  constructor(patronId: string) {
    super('El patrón no existe o no pertenece al usuario autenticado.');
    this.name = 'PatronNoEncontradoError';
    this.patronId = patronId;
  }
}
