import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository, Patron } from '../ports/patron-repository.port';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { validarPatron } from './validar-patron';

export type CrearPatronError =
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
 *   ownership de `categoriaId` (404) → forma de `patron` →
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
    categoriaId: string;
    patron: string;
    matchType: string;
    prioridad?: number;
  }): Promise<Result<Patron, CrearPatronError>> {
    const categoria = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.categoriaId,
    );
    if (categoria === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
    }

    const validado = validarPatron({
      patron: input.patron,
      matchType: input.matchType,
      prioridad: input.prioridad,
    });
    if (validado.isFail()) {
      return Result.fail(validado.getError());
    }
    const { patron, matchType, prioridad } = validado.getValue();

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
