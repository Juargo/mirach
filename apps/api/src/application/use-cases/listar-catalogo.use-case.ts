import { Result } from '../../shared/result';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';

/**
 * ListarCatalogoUseCase — use case de lectura para `GET /api/categorias`
 * (US-038, CAT038-02).
 *
 * Solo lectura: NO declara `esDemo` en su input — una sesión demo también
 * puede leer su propio catálogo (CAT038-08). El aislamiento por `userId` lo
 * garantiza el repositorio en la cláusula SQL `WHERE` (RNF-SEC-006); este
 * use case no filtra ni transforma nada. Nunca lanza.
 */
export class ListarCatalogoUseCase {
  constructor(private readonly categoriaRepository: ICategoriaRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<CategoriaConPatrones[], never>> {
    const catalogo = await this.categoriaRepository.listarConPatrones(
      input.userId,
    );
    return Result.ok(catalogo);
  }
}
