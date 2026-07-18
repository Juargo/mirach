/**
 * IReloj — puerto de reloj, para desacoplar el instante "ahora" de `Date.now()`.
 *
 * Permite que los use cases (y sus tests) controlen el instante exacto usado
 * para calcular expiración de sesión (AUTH-06), sin depender del reloj real.
 */
export interface IReloj {
  ahora(): Date;
}

/** Injection token — interfaces are erased at runtime. */
export const RELOJ = 'IReloj';
