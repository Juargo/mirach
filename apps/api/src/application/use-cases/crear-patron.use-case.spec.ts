import { CrearPatronUseCase } from './crear-patron.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { Bucket } from '../../domain/value-objects/bucket';

const CATEGORIA = {
  id: 'cat-1',
  nombre: 'Streaming',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
};

function makeCategoriaRepo(
  overrides: Partial<ICategoriaRepository> = {},
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId: vi.fn().mockResolvedValue(CATEGORIA),
    existeNombre: vi.fn(),
    crearConPatrones: vi.fn(),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
    ...overrides,
  };
}

function makePatronRepo(
  overrides: Partial<IPatronRepository> = {},
): IPatronRepository {
  return {
    buscarPorId: vi.fn(),
    existePatron: vi.fn().mockResolvedValue(false),
    crear: vi.fn().mockResolvedValue({
      id: 'patron-1',
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    }),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
    ...overrides,
  };
}

describe('CrearPatronUseCase', () => {
  it('el demo gate corta ANTES de cualquier llamada a los repositorios', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(categoriaRepo.buscarPorId).not.toHaveBeenCalled();
  });

  it('404 cuando la categoría es ajena o no existe', async () => {
    const categoriaRepo = makeCategoriaRepo({
      buscarPorId: vi.fn().mockResolvedValue(null),
    });
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-ajena',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });

  it('crea el patrón con los valores válidos y prioridad por defecto 100', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: '  netflix  ',
      matchType: 'CONTAINS',
    });

    expect(result.isOk()).toBe(true);
    expect(patronRepo.crear).toHaveBeenCalledWith('user-1', {
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    });
  });

  it.each(['', '  ', 'x'.repeat(201)])(
    'rechaza un patron inválido: %j',
    async (patron) => {
      const categoriaRepo = makeCategoriaRepo();
      const patronRepo = makePatronRepo();
      const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        esDemo: false,
        categoriaId: 'cat-1',
        patron,
        matchType: 'CONTAINS',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PatronInvalidoError);
    },
  );

  it('rechaza un matchType inválido (primer punto de escritura que lo valida)', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'FUZZY',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MatchTypeInvalidoError);
  });

  it('con matchType REGEX, valida que el patrón compile (new RegExp)', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: '(',
      matchType: 'REGEX',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RegexInvalidaError);
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });

  it('una REGEX válida se acepta', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: '^net.*',
      matchType: 'REGEX',
    });

    expect(result.isOk()).toBe(true);
  });

  it('prioridad fuera de rango (1000) es rechazada', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 1000,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadInvalidaError);
  });

  it('rechaza un patrón duplicado, case-insensitive, por usuario (409)', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo({
      existePatron: vi.fn().mockResolvedValue(true),
    });
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      categoriaId: 'cat-1',
      patron: 'Netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronDuplicadoError);
    expect(patronRepo.existePatron).toHaveBeenCalledWith('user-1', 'Netflix');
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });
});
