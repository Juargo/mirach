import { Result } from '../../shared/result';
import { IPatronRepository, Patron } from '../ports/patron-repository.port';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';

const PATRON_MIN = 1;
const PATRON_MAX = 200;
const PRIORIDAD_MIN = 1;
const PRIORIDAD_MAX = 999;

const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type ActualizarPatronError =
  | CatalogoDemoSoloLecturaError
  | PatronNoEncontradoError
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError
  | PatronDuplicadoError;

/**
 * ActualizarPatronUseCase — use case de escritura para
 * `PATCH /api/patrones/:id` (US-038, CAT038-05).
 *
 * Body PARCIAL (Q4): `patron`, `matchType`, `prioridad` son todos
 * opcionales. `categoriaId` NO se acepta — mover un patrón entre
 * categorías es un non-goal explícito.
 *
 * Orden de validación: demo gate → 404 (fila ajena/inexistente) → `patron`?
 * forma + unicidad self-excluded → `matchType`? ∈ set → si el `matchType`
 * EFECTIVO (el enviado, o el actual si no se envía) es REGEX, el `patron`
 * EFECTIVO (el enviado, o el actual) debe compilar → `prioridad`? rango →
 * delega en el repositorio. Nunca lanza.
 */
export class ActualizarPatronUseCase {
  constructor(private readonly patronRepository: IPatronRepository) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    id: string;
    patron?: string;
    matchType?: string;
    prioridad?: number;
  }): Promise<Result<Patron, ActualizarPatronError>> {
    if (input.esDemo) {
      return Result.fail(new CatalogoDemoSoloLecturaError());
    }

    const actual = await this.patronRepository.buscarPorId(
      input.userId,
      input.id,
    );
    if (actual === null) {
      return Result.fail(new PatronNoEncontradoError(input.id));
    }

    const patch: {
      patron?: string;
      matchType?: MatchType;
      prioridad?: number;
    } = {};

    if (input.patron !== undefined) {
      const patron = input.patron.trim();
      if (patron.length < PATRON_MIN || patron.length > PATRON_MAX) {
        return Result.fail(new PatronInvalidoError(input.patron));
      }

      const colisiona = await this.patronRepository.existePatron(
        input.userId,
        patron,
        input.id,
      );
      if (colisiona) {
        return Result.fail(new PatronDuplicadoError(patron));
      }

      patch.patron = patron;
    }

    if (input.matchType !== undefined) {
      if (
        !MATCH_TYPES.includes(input.matchType as (typeof MATCH_TYPES)[number])
      ) {
        return Result.fail(new MatchTypeInvalidoError(input.matchType));
      }
      patch.matchType = input.matchType as MatchType;
    }

    const matchTypeEfectivo = patch.matchType ?? actual.matchType;
    const patronEfectivo = patch.patron ?? actual.patron;
    if (matchTypeEfectivo === 'REGEX' && !regexCompila(patronEfectivo)) {
      return Result.fail(new RegexInvalidaError(patronEfectivo));
    }

    if (input.prioridad !== undefined) {
      if (
        !Number.isInteger(input.prioridad) ||
        input.prioridad < PRIORIDAD_MIN ||
        input.prioridad > PRIORIDAD_MAX
      ) {
        return Result.fail(new PrioridadInvalidaError(input.prioridad));
      }
      patch.prioridad = input.prioridad;
    }

    const actualizado = await this.patronRepository.actualizar(
      input.userId,
      input.id,
      patch,
    );
    return Result.ok(actualizado);
  }
}

function regexCompila(patron: string): boolean {
  try {
    new RegExp(patron);
    return true;
  } catch {
    return false;
  }
}
