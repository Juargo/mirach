import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaEnUsoError } from '../../domain/errors/categoria-en-uso.error';

export type EliminarCategoriaError =
  | CatalogoDemoSoloLecturaError
  | CategoriaNoEncontradaError
  | CategoriaEnUsoError;

/**
 * EliminarCategoriaUseCase — use case de escritura para
 * `DELETE /api/categorias/:id` (US-038, CAT038-04).
 *
 * Non-goal explícito (US-039, NO absorbido aquí): el `409` es el
 * deliverable de este use case — reasignar/migrar las transacciones de una
 * categoría en uso queda fuera de alcance.
 *
 * NO hace su propio pre-chequeo de "en uso": eso sería un TOCTOU (una
 * ingesta concurrente podría categorizar en la categoría entre el check y
 * el delete). El predicado "en uso" vive dentro del propio statement de
 * borrado del adapter (D-06) — este use case solo mapea demo gate +
 * delega. Nunca lanza.
 */
export class EliminarCategoriaUseCase {
  constructor(private readonly categoriaRepository: ICategoriaRepository) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    id: string;
  }): Promise<Result<void, EliminarCategoriaError>> {
    if (input.esDemo) {
      return Result.fail(new CatalogoDemoSoloLecturaError());
    }

    return this.categoriaRepository.eliminar(input.userId, input.id);
  }
}
