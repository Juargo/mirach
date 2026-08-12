import { ActualizarCategoriaUseCase } from './actualizar-categoria.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { Bucket } from '../../domain/value-objects/bucket';

const CATEGORIA_ACTUAL = {
  id: 'cat-1',
  nombre: 'Delivery',
  bucket: Bucket.Deseos,
  patrones: [],
};

function makeRepo(
  overrides: Partial<ICategoriaRepository> = {},
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId: vi.fn().mockResolvedValue(CATEGORIA_ACTUAL),
    existeNombre: vi.fn().mockResolvedValue(false),
    crear: vi.fn(),
    actualizar: vi.fn().mockResolvedValue({
      ...CATEGORIA_ACTUAL,
      nombre: 'Delivery renombrado',
    }),
    eliminar: vi.fn(),
    ...overrides,
  };
}

describe('ActualizarCategoriaUseCase', () => {
  it('el demo gate corta ANTES de cualquier llamada al repositorio', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      id: 'cat-1',
      nombre: 'Nuevo nombre',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(repo.buscarPorId).not.toHaveBeenCalled();
  });

  it('404 cuando la fila no es del caller — antes de validar campos', async () => {
    const repo = makeRepo({ buscarPorId: vi.fn().mockResolvedValue(null) });
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-ajena',
      nombre: 'x'.repeat(999), // sería inválido, pero el 404 debe ganar
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
  });

  it('body parcial: solo nombre es válido (Q4)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      nombre: 'Delivery renombrado',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'cat-1', {
      nombre: 'Delivery renombrado',
    });
  });

  it('body parcial: solo bucket es válido (Q4)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      bucket: 'Necesidades',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'cat-1', {
      bucketId: 'Necesidades',
    });
  });

  it('rechaza un nombre inválido', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      nombre: '   ',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NombreCategoriaInvalidoError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('la unicidad de nombre EXCLUYE la propia fila (self-exclusion)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      nombre: 'Delivery renombrado',
    });

    expect(repo.existeNombre).toHaveBeenCalledWith(
      'user-1',
      'Delivery renombrado',
      'cat-1',
    );
  });

  it('rechaza una colisión de nombre con otra categoría del mismo usuario (409)', async () => {
    const repo = makeRepo({ existeNombre: vi.fn().mockResolvedValue(true) });
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      nombre: 'ahorro',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NombreCategoriaDuplicadoError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('rechaza un bucket no asignable', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      bucket: 'Ingreso',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(BucketNoAsignableError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('bucketId se OMITE del patch cuando el bucket enviado es igual al actual (D-07)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      nombre: 'Delivery renombrado',
      bucket: 'Deseos', // igual al bucket actual de CATEGORIA_ACTUAL
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'cat-1', {
      nombre: 'Delivery renombrado',
    });
  });

  it('bucketId se INCLUYE en el patch cuando el bucket sí cambió (D-07, re-stamp trigger)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
      bucket: 'Necesidades',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'cat-1', {
      bucketId: 'Necesidades',
    });
  });
});
