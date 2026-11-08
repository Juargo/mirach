import { Result } from '../../shared/result';
import { IPatronRepository, Patron } from '../ports/patron-repository.port';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';

const PATRON_MIN = 1;
const PATRON_MAX = 200;
const PRIORIDAD_MIN = 1;
const PRIORIDAD_MAX = 999;

const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type ActualizarPatronError =
  | PatronNoEncontradoError
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError
  | PatronDuplicadoError
  | CategoriaNoEncontradaError
  | CategoriaInternaProtegidaError;

/**
 * ActualizarPatronUseCase — use case de escritura para
 * `PATCH /api/patrones/:id` (US-038, CAT038-05).
 *
 * Body PARCIAL (Q4): `patron`, `matchType`, `prioridad` y `categoriaId`
 * son todos opcionales. `categoriaId` mueve el patrón a otra categoría del
 * usuario (CLA-17: "Si el patrón ya existe en otra categoría, la app lo dice
 * y ofrece moverlo"). Es la MISMA fila: conserva su `id` y su `creadoEn`, el
 * desempate de CLA-12. Mover el patrón no mueve movimientos ya
 * clasificados; eso es `moverDelPeriodo` al crear, o "aplicar a parecidos".
 *
 * Orden de validación: 404 (fila ajena/inexistente) → `categoriaId`?
 * propiedad (404 `CATEGORIA_NO_ENCONTRADA`) + no interna (403, CLA-18) →
 * `patron`?
 * forma + unicidad self-excluded → `matchType`? ∈ set → si el `matchType`
 * EFECTIVO (el enviado, o el actual si no se envía) es REGEX, el `patron`
 * EFECTIVO (el enviado, o el actual) debe compilar → `prioridad`? rango →
 * delega en el repositorio. Nunca lanza.
 */
export class ActualizarPatronUseCase {
  constructor(
    private readonly patronRepository: IPatronRepository,
    private readonly categoriaRepository: ICategoriaRepository,
  ) {}

  async execute(input: {
    userId: string;
    id: string;
    patron?: string;
    matchType?: string;
    prioridad?: number;
    categoriaId?: string;
  }): Promise<Result<Patron, ActualizarPatronError>> {
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
      categoriaId?: string;
    } = {};

    if (input.categoriaId !== undefined) {
      const categoria = await this.categoriaRepository.buscarPorId(
        input.userId,
        input.categoriaId,
      );
      if (categoria === null) {
        return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
      }
      // CLA-18: "Desconocido" receives what matches no pattern; it holds none.
      if (categoria.esInterna) {
        return Result.fail(
          new CategoriaInternaProtegidaError(input.categoriaId, 'patron'),
        );
      }
      patch.categoriaId = categoria.id;
    }

    if (input.patron !== undefined) {
      const patron = input.patron.trim();
      if (patron.length < PATRON_MIN || patron.length > PATRON_MAX) {
        return Result.fail(new PatronInvalidoError(input.patron));
      }

      const existente = await this.patronRepository.buscarPorTexto(
        input.userId,
        patron,
        input.id,
      );
      if (existente !== null) {
        return Result.fail(new PatronDuplicadoError(patron, existente));
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
