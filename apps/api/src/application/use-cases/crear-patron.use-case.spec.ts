import { CrearPatronUseCase } from './crear-patron.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { Bucket } from '../../domain/value-objects/bucket';

/** CLA-17: the pattern that already holds the text, with its category. */
const EXISTENTE = {
  patronId: 'patron-existente',
  categoriaId: 'cat-otra',
  categoria: 'Otra',
  bucket: 'Deseos' as never,
};

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
    buscarPorTexto: vi.fn().mockResolvedValue(null),
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
  it('404 cuando la categoría es ajena o no existe', async () => {
    const categoriaRepo = makeCategoriaRepo({
      buscarPorId: vi.fn().mockResolvedValue(null),
    });
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      categoriaId: 'cat-ajena',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });

  it('CLA-18: rechaza un patrón en una categoría interna ("Desconocido") y no lo crea', async () => {
    const categoriaRepo = makeCategoriaRepo({
      buscarPorId: vi.fn().mockResolvedValue({
        ...CATEGORIA,
        id: 'cat-desconocido',
        nombre: 'Desconocido',
        esInterna: true,
      }),
    });
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      categoriaId: 'cat-desconocido',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(CategoriaInternaProtegidaError);
    expect(error.message).toBe(
      'Esta categoría es interna del sistema: no acepta patrones.',
    );
    expect(patronRepo.buscarPorTexto).not.toHaveBeenCalled();
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });

  it('crea el patrón con los valores válidos y prioridad por defecto 100', async () => {
    const categoriaRepo = makeCategoriaRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
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
      buscarPorTexto: vi.fn().mockResolvedValue(EXISTENTE),
    });
    const useCase = new CrearPatronUseCase(categoriaRepo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      categoriaId: 'cat-1',
      patron: 'Netflix',
      matchType: 'CONTAINS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronDuplicadoError);
    expect(patronRepo.buscarPorTexto).toHaveBeenCalledWith('user-1', 'Netflix');
    // CLA-17: the 409 names the pattern that already holds the text.
    expect((result.getError() as PatronDuplicadoError).existente).toEqual(
      EXISTENTE,
    );
    expect(patronRepo.crear).not.toHaveBeenCalled();
  });
});
