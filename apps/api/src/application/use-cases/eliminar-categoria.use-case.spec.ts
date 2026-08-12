import { EliminarCategoriaUseCase } from './eliminar-categoria.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { Result } from '../../shared/result';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';

function makeRepo(
  eliminar: ICategoriaRepository['eliminar'],
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId: vi.fn(),
    existeNombre: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar,
  };
}

describe('EliminarCategoriaUseCase', () => {
  it('el demo gate corta ANTES de llamar al repositorio', async () => {
    const eliminar = vi.fn();
    const repo = makeRepo(eliminar);
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('delega en el repositorio con userId + id y propaga Result.ok', async () => {
    const eliminar = vi.fn().mockResolvedValue(Result.ok(undefined));
    const repo = makeRepo(eliminar);
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isOk()).toBe(true);
    expect(eliminar).toHaveBeenCalledWith('user-1', 'cat-1');
  });

  it('propaga CategoriaNoEncontradaError (404) sin pre-chequeo propio', async () => {
    const eliminar = vi
      .fn()
      .mockResolvedValue(Result.fail(new CategoriaNoEncontradaError('cat-1')));
    const repo = makeRepo(eliminar);
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
  });
});
