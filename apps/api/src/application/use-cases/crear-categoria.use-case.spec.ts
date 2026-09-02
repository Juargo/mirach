import { CrearCategoriaUseCase } from './crear-categoria.use-case';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
import { PatronEnLoteInvalidoError } from '../../domain/errors/patron-en-lote-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { Bucket } from '../../domain/value-objects/bucket';

function makeRepo(
  overrides: Partial<ICategoriaRepository> = {},
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId: vi.fn(),
    existeNombre: vi.fn().mockResolvedValue(false),
    crearConPatrones: vi.fn().mockResolvedValue({
      id: 'cat-nueva',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 0,
    }),
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
    crear: vi.fn(),
    actualizar: vi.fn(),
    eliminar: vi.fn(),
    ...overrides,
  };
}

describe('CrearCategoriaUseCase', () => {
  it('el demo gate corta ANTES de cualquier llamada a los repositorios (D-04/D-05)', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(repo.existeNombre).not.toHaveBeenCalled();
    expect(repo.crearConPatrones).not.toHaveBeenCalled();
    expect(patronRepo.existePatron).not.toHaveBeenCalled();
  });

  it('crea la categoría con nombre + bucket válidos (CA-01), patrones ausente ⇒ [] byte-identical', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: '  Mascotas  ',
      bucket: 'Deseos',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.crearConPatrones).toHaveBeenCalledWith('user-1', {
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });
  });

  it('patrones: [] explícito se comporta idéntico a la ausencia', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });

    expect(result.isOk()).toBe(true);
    expect(repo.crearConPatrones).toHaveBeenCalledWith('user-1', {
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });
  });

  it.each(['', '  ', 'x'.repeat(41)])(
    'rechaza un nombre inválido: %j',
    async (nombre) => {
      const repo = makeRepo();
      const patronRepo = makePatronRepo();
      const useCase = new CrearCategoriaUseCase(repo, patronRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        esDemo: false,
        nombre,
        bucket: 'Deseos',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(NombreCategoriaInvalidoError);
      expect(repo.crearConPatrones).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'nope', 'Ingreso', 'SinCategoria'])(
    'rechaza un bucket no asignable: %j',
    async (bucket) => {
      const repo = makeRepo();
      const patronRepo = makePatronRepo();
      const useCase = new CrearCategoriaUseCase(repo, patronRepo);

      const result = await useCase.execute({
        userId: 'user-1',
        esDemo: false,
        nombre: 'Mascotas',
        bucket: bucket,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketNoAsignableError);
      expect(repo.crearConPatrones).not.toHaveBeenCalled();
    },
  );

  it('rechaza un nombre duplicado, case-insensitive, por usuario (409) — precede la inspección de patrones', async () => {
    const repo = makeRepo({ existeNombre: vi.fn().mockResolvedValue(true) });
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'netflix', matchType: 'CONTAINS' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NombreCategoriaDuplicadoError);
    expect(repo.existeNombre).toHaveBeenCalledWith({
      userId: 'user-1',
      nombre: 'mascotas',
      bucket: 'Deseos',
    });
    expect(repo.crearConPatrones).not.toHaveBeenCalled();
    expect(patronRepo.existePatron).not.toHaveBeenCalled();
  });

  it('la categoría creada vuelve con patrones: [] (CA-03) cuando no se envían patrones', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result.getValue().patrones).toEqual([]);
  });

  it('una lista válida de patrones produce UNA sola llamada a crearConPatrones con los 3 validados', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [
        { patron: '  petco  ', matchType: 'CONTAINS' },
        { patron: 'vet', matchType: 'STARTS_WITH' },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(repo.crearConPatrones).toHaveBeenCalledTimes(1);
    expect(repo.crearConPatrones).toHaveBeenCalledWith('user-1', {
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [
        { patron: 'petco', matchType: 'CONTAINS', prioridad: 100 },
        { patron: 'vet', matchType: 'STARTS_WITH', prioridad: 100 },
      ],
    });
  });

  it('un patrón inválido en el índice 1 ⇒ PatronEnLoteInvalidoError{indice:1}, el repositorio NUNCA se llama', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [
        { patron: 'netflix', matchType: 'CONTAINS' },
        { patron: 'spotify', matchType: 'FUZZY' },
      ],
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(PatronEnLoteInvalidoError);
    expect((error as PatronEnLoteInvalidoError).indice).toBe(1);
    expect((error as PatronEnLoteInvalidoError).causa).toBeInstanceOf(
      MatchTypeInvalidoError,
    );
    expect(repo.crearConPatrones).not.toHaveBeenCalled();
  });

  it('duplicado case-insensitive DENTRO del mismo lote ⇒ error en la SEGUNDA ocurrencia', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [
        { patron: 'netflix', matchType: 'CONTAINS' },
        { patron: 'Netflix', matchType: 'STARTS_WITH' },
      ],
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(PatronEnLoteInvalidoError);
    expect((error as PatronEnLoteInvalidoError).indice).toBe(1);
    expect((error as PatronEnLoteInvalidoError).causa).toBeInstanceOf(
      PatronDuplicadoError,
    );
    expect(repo.crearConPatrones).not.toHaveBeenCalled();
  });

  it('un patrón que colisiona con el catálogo existente (existePatron) ⇒ error envuelto con su índice', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo({
      existePatron: vi.fn().mockResolvedValue(true),
    });
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'netflix', matchType: 'CONTAINS' }],
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(PatronEnLoteInvalidoError);
    expect((error as PatronEnLoteInvalidoError).indice).toBe(0);
    expect((error as PatronEnLoteInvalidoError).causa).toBeInstanceOf(
      PatronDuplicadoError,
    );
    expect(repo.crearConPatrones).not.toHaveBeenCalled();
  });

  it('prioridad NO es caller-supplied — el default 100 siempre aplica a patrones anidados', async () => {
    const repo = makeRepo();
    const patronRepo = makePatronRepo();
    const useCase = new CrearCategoriaUseCase(repo, patronRepo);

    await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'netflix', matchType: 'CONTAINS' }],
    });

    expect(repo.crearConPatrones).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        patrones: [
          { patron: 'netflix', matchType: 'CONTAINS', prioridad: 100 },
        ],
      }),
    );
  });
});
