import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * IUltimoPeriodoConDatosReader — narrow port de solo lectura (issue #747).
 *
 * Resuelve el último mes calendario (UTC) en el que el usuario tiene AL
 * MENOS una transacción. Lo consume `resolverPeriodo` (application/
 * use-cases/resolver-periodo.ts) para reemplazar, en los 6 use cases de
 * lectura mensual, el fallback "período ausente → mes en curso" por
 * "período ausente → último mes del usuario con datos" — cayendo a
 * `PeriodoMes.actual()` SOLO cuando el usuario no tiene ninguna transacción.
 *
 * `null` cuando el usuario no tiene ninguna transacción (nunca un error —
 * "sin datos" es un estado válido, no una falla).
 *
 * User isolation estructural en la implementación (`account: { userId }`),
 * como el resto de los readers de este mismo dominio (RNF-SEC-006). Nunca
 * lanza — no hay entrada del usuario que validar acá (a diferencia de
 * `PeriodoMes.crear`), así que no hace falta `Result`.
 */
export interface IUltimoPeriodoConDatosReader {
  ultimoPeriodoConDatos(userId: string): Promise<PeriodoMes | null>;
}

/** Injection token — interfaces are erased at runtime. */
export const ULTIMO_PERIODO_CON_DATOS_READER = 'IUltimoPeriodoConDatosReader';
