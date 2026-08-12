import { ListarCatalogoUseCase } from './listar-catalogo.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { Bucket } from '../../domain/value-objects/bucket';

function makeRepo(
  listarConPatrones: ICategoriaRepository['listarConPatrones'],
): ICategoriaRepository {
  return {
    listarConPatrones,
    buscarPorId: vi.fn(),
    existeNombre: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
  };
}

describe('ListarCatalogoUseCase', () => {
  it('delega en el repositorio con userId y retorna Result.ok con el catálogo (CAT038-02)', async () => {
    const catalogo = [
      {
        id: 'cat-1',
        nombre: 'Mascotas',
        bucket: Bucket.Deseos,
        patrones: [],
      },
    ];
    const listarConPatrones = vi.fn().mockResolvedValue(catalogo);
    const repo = makeRepo(listarConPatrones);
    const useCase = new ListarCatalogoUseCase(repo);

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(catalogo);
    expect(listarConPatrones).toHaveBeenCalledWith('user-1');
  });

  it('una categoría sin patrones se retorna con patrones: [] (CA-03)', async () => {
    const catalogo = [
      { id: 'cat-1', nombre: 'Vacía', bucket: Bucket.Ahorro, patrones: [] },
    ];
    const repo = makeRepo(vi.fn().mockResolvedValue(catalogo));
    const useCase = new ListarCatalogoUseCase(repo);

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.getValue()[0]?.patrones).toEqual([]);
  });

  it('el input NO acepta esDemo (chequeo a nivel de tipos, D-04)', () => {
    const repo = makeRepo(vi.fn().mockResolvedValue([]));
    const useCase = new ListarCatalogoUseCase(repo);

    const llamadaInvalida = () =>
      useCase.execute({
        userId: 'user-1',
        // @ts-expect-error — ListarCatalogoUseCase no declara esDemo en su input (es de solo lectura)
        esDemo: false,
      });
    void llamadaInvalida;
  });
});
