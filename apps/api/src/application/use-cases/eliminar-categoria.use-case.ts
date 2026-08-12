import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';

export type EliminarCategoriaError =
  | CatalogoDemoSoloLecturaError
  | CategoriaNoEncontradaError;

/**
 * EliminarCategoriaUseCase — use case de escritura para
 * `DELETE /api/categorias/:id` (US-038/US-039, CAT038-04 as modified).
 *
 * El delete SIEMPRE succeeds para una categoría del caller, esté o no en
 * uso — no hay rechazo por "en uso" (US-039 retiró ese `409`). Las
 * transacciones que referenciaban la categoría sobreviven con
 * `categoriaId: null`; su `bucketId` nunca se toca, así que borrar una
 * categoría no mueve dinero entre buckets (CAT038-04, CA-04).
 *
 * Este use case solo mapea el demo gate + delega — la mecánica del delete
 * (children-first, composite FK) vive en el adapter
 * (`PrismaCategoriaRepository#eliminar`, design.md Q4). Nunca lanza.
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
