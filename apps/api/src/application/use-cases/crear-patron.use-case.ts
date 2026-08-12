import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository, Patron } from '../ports/patron-repository.port';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';

const PATRON_MIN = 1;
const PATRON_MAX = 200;
const PRIORIDAD_MIN = 1;
const PRIORIDAD_MAX = 999;
const PRIORIDAD_DEFAULT = 100;

const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type CrearPatronError =
  | CatalogoDemoSoloLecturaError
  | CategoriaNoEncontradaError
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError
  | PatronDuplicadoError;

/**
 * CrearPatronUseCase — use case de escritura para `POST /api/patrones`
 * (US-038, CAT038-05/06).
 *
 * Orden de validación (design.md §5.1/§5.2, mirrors CrearPatronError union):
 *   demo gate → ownership de `categoriaId` (404) → forma de `patron` →
 *   `matchType` ∈ set → si REGEX, compila → `prioridad` (default 100,
 *   rango 1..999) → unicidad case-insensitive de `patron` por usuario →
 *   creación.
 *
 * El chequeo de escritura de REGEX es un gate MÁS TEMPRANO y amigable —
 * NUNCA reemplaza el `try/catch` de `coincide()`, que sigue degradando
 * cualquier patrón malformado preexistente a no-match (CA-05). Nunca lanza.
 */
export class CrearPatronUseCase {
  constructor(
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly patronRepository: IPatronRepository,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    categoriaId: string;
    patron: string;
    matchType: string;
    prioridad?: number;
  }): Promise<Result<Patron, CrearPatronError>> {
    if (input.esDemo) {
      return Result.fail(new CatalogoDemoSoloLecturaError());
    }

    const categoria = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.categoriaId,
    );
    if (categoria === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
    }

    const patron = input.patron.trim();
    if (patron.length < PATRON_MIN || patron.length > PATRON_MAX) {
      return Result.fail(new PatronInvalidoError(input.patron));
    }

    if (
      !MATCH_TYPES.includes(input.matchType as (typeof MATCH_TYPES)[number])
    ) {
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

    const duplicado = await this.patronRepository.existePatron(
      input.userId,
      patron,
    );
    if (duplicado) {
      return Result.fail(new PatronDuplicadoError(patron));
    }

    const nuevo = await this.patronRepository.crear(input.userId, {
      categoriaId: input.categoriaId,
      patron,
      matchType,
      prioridad,
    });
    return Result.ok(nuevo);
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
