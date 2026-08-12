import { EliminarPatronUseCase } from './eliminar-patron.use-case';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';

function makeRepo(eliminar: IPatronRepository['eliminar']): IPatronRepository {
  return {
    buscarPorId: vi.fn(),
    existePatron: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar,
  };
}

describe('EliminarPatronUseCase', () => {
  it('el demo gate corta ANTES de llamar al repositorio', async () => {
    const eliminar = vi.fn();
    const repo = makeRepo(eliminar);
    const useCase = new EliminarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      id: 'patron-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('delega en el repositorio y retorna Result.ok cuando elimina', async () => {
    const eliminar = vi.fn().mockResolvedValue(true);
    const repo = makeRepo(eliminar);
    const useCase = new EliminarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
    });

    expect(result.isOk()).toBe(true);
    expect(eliminar).toHaveBeenCalledWith('user-1', 'patron-1');
  });

  it('adapter false (ausente o ajeno) ⇒ PatronNoEncontradoError (404, anti-enumeration)', async () => {
    const eliminar = vi.fn().mockResolvedValue(false);
    const repo = makeRepo(eliminar);
    const useCase = new EliminarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-ajeno',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronNoEncontradoError);
  });
});
