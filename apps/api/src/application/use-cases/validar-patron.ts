import { Result } from '../../shared/result';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';

const PATRON_MIN = 1;
const PATRON_MAX = 200;
const PRIORIDAD_MIN = 1;
const PRIORIDAD_MAX = 999;
const PRIORIDAD_DEFAULT = 100;

const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type PatronFormatoError =
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError;

export interface PatronValidado {
  readonly patron: string;
  readonly matchType: MatchType;
  readonly prioridad: number;
}

/**
 * validarPatron — validación de FORMA de un patrón de clasificación, pura
 * (sin I/O), extraída de `CrearPatronUseCase` (design.md D-02).
 *
 * Cubre EXACTAMENTE las reglas sin I/O que `CrearPatronUseCase` ya
 * validaba, en el mismo orden: `patron` trim + 1–200 chars →
 * `matchType` ∈ set → si REGEX, compila → `prioridad` (default 100, rango
 * 1..999). NO valida ownership de categoría (404) ni unicidad (409) — esas
 * reglas necesitan I/O y quedan en los callers (`CrearPatronUseCase` para
 * su propio 404; `CrearCategoriaUseCase` para el chequeo dentro-del-lote +
 * `existePatron` de cada patrón anidado, design.md D-02/D-03). Nunca lanza.
 */
export function validarPatron(input: {
  patron: string;
  matchType: string;
  prioridad?: number;
}): Result<PatronValidado, PatronFormatoError> {
  const patron = input.patron.trim();
  if (patron.length < PATRON_MIN || patron.length > PATRON_MAX) {
    return Result.fail(new PatronInvalidoError(input.patron));
  }

  if (!MATCH_TYPES.includes(input.matchType as (typeof MATCH_TYPES)[number])) {
    return Result.fail(new MatchTypeInvalidoError(input.matchType));
  }
  const matchType = input.matchType as MatchType;

  if (matchType === 'REGEX' && !regexCompila(patron)) {
    return Result.fail(new RegexInvalidaError(patron));
  }

  const prioridad = input.prioridad ?? PRIORIDAD_DEFAULT;
  if (
    input.prioridad !== undefined &&
    (!Number.isInteger(prioridad) ||
      prioridad < PRIORIDAD_MIN ||
      prioridad > PRIORIDAD_MAX)
  ) {
    return Result.fail(new PrioridadInvalidaError(input.prioridad));
  }

  return Result.ok({ patron, matchType, prioridad });
}

function regexCompila(patron: string): boolean {
  try {
    new RegExp(patron);
    return true;
  } catch {
    return false;
  }
}
