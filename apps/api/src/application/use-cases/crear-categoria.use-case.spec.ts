import { CrearCategoriaUseCase } from './crear-categoria.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
import { Bucket } from '../../domain/value-objects/bucket';

function makeRepo(
  overrides: Partial<ICategoriaRepository> = {},
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId: vi.fn(),
    existeNombre: vi.fn().mockResolvedValue(false),
    crear: vi.fn().mockResolvedValue({
      id: 'cat-nueva',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
    }),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
    ...overrides,
  };
}

describe('CrearCategoriaUseCase', () => {
  it('el demo gate corta ANTES de cualquier llamada al repositorio (D-04/D-05)', async () => {
    const repo = makeRepo();
    const useCase = new CrearCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(repo.existeNombre).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('crea la categoría con nombre + bucket válidos (CA-01)', async () => {
    const repo = makeRepo();
    const useCase = new CrearCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: '  Mascotas  ',
      bucket: 'Deseos',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.crear).toHaveBeenCalledWith('user-1', {
      nombre: 'Mascotas',
      bucketId: 'Deseos',
    });
  });

  it.each(['', '  ', 'x'.repeat(41)])(
    'rechaza un nombre inválido: %j',
    async (nombre) => {
      const repo = makeRepo();
      const useCase = new CrearCategoriaUseCase(repo);

      const result = await useCase.execute({
        userId: 'user-1',
        esDemo: false,
        nombre,
        bucket: 'Deseos',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(NombreCategoriaInvalidoError);
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'nope', 'Ingreso', 'SinCategoria'])(
    'rechaza un bucket no asignable: %j',
    async (bucket) => {
      const repo = makeRepo();
      const useCase = new CrearCategoriaUseCase(repo);

      const result = await useCase.execute({
        userId: 'user-1',
        esDemo: false,
        nombre: 'Mascotas',
        bucket: bucket,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketNoAsignableError);
      expect(repo.crear).not.toHaveBeenCalled();
    },
  );

  it('rechaza un nombre duplicado, case-insensitive, por usuario (409)', async () => {
    const repo = makeRepo({ existeNombre: vi.fn().mockResolvedValue(true) });
    const useCase = new CrearCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'mascotas',
      bucket: 'Deseos',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NombreCategoriaDuplicadoError);
    expect(repo.existeNombre).toHaveBeenCalledWith('user-1', 'mascotas');
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('la categoría creada vuelve con patrones: [] (CA-03)', async () => {
    const repo = makeRepo();
    const useCase = new CrearCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result.getValue().patrones).toEqual([]);
  });
});
