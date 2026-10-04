import { Result } from '../../shared/result';
import { IPatronRepository } from '../ports/patron-repository.port';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';

export type EliminarPatronError = PatronNoEncontradoError;

/**
 * EliminarPatronUseCase — use case de escritura para
 * `DELETE /api/patrones/:id` (US-038, CAT038-05/07).
 *
 * Thin delegate al repositorio. `false` del adapter
 * ("ausente" o "ajeno", indistinguibles — anti-enumeration) se traduce a
 * `PatronNoEncontradoError` (404). Nunca lanza.
 */
export class EliminarPatronUseCase {
  constructor(private readonly patronRepository: IPatronRepository) {}

  async execute(input: {
    userId: string;
    id: string;
  }): Promise<Result<void, EliminarPatronError>> {
    const eliminado = await this.patronRepository.eliminar(
      input.userId,
      input.id,
    );
    if (!eliminado) {
      return Result.fail(new PatronNoEncontradoError(input.id));
    }

    return Result.ok(undefined);
  }
}
