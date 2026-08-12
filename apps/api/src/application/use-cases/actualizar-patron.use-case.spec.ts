import { ActualizarPatronUseCase } from './actualizar-patron.use-case';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';

const PATRON_ACTUAL = {
  id: 'patron-1',
  categoriaId: 'cat-1',
  patron: 'netflix',
  matchType: 'CONTAINS' as const,
  prioridad: 100,
};

function makeRepo(
  overrides: Partial<IPatronRepository> = {},
): IPatronRepository {
  return {
    buscarPorId: vi.fn().mockResolvedValue(PATRON_ACTUAL),
    existePatron: vi.fn().mockResolvedValue(false),
    crear: vi.fn(),
    actualizar: vi
      .fn()
      .mockResolvedValue({ ...PATRON_ACTUAL, patron: 'netflix renombrado' }),
    eliminar: vi.fn(),
    ...overrides,
  };
}

describe('ActualizarPatronUseCase', () => {
  it('el demo gate corta ANTES de cualquier llamada al repositorio', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      id: 'patron-1',
      patron: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(repo.buscarPorId).not.toHaveBeenCalled();
  });

  it('404 cuando el patrón es ajeno o no existe', async () => {
    const repo = makeRepo({ buscarPorId: vi.fn().mockResolvedValue(null) });
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-ajeno',
      patron: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronNoEncontradoError);
  });

  it('body parcial: solo patron es válido (Q4)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      patron: 'netflix renombrado',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'patron-1', {
      patron: 'netflix renombrado',
    });
  });

  it('body parcial: solo prioridad es válido (Q4)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      prioridad: 50,
    });

    expect(result.isOk()).toBe(true);
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'patron-1', {
      prioridad: 50,
    });
  });

  it('rechaza un patron inválido', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      patron: '   ',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronInvalidoError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('la unicidad de patron EXCLUYE la propia fila (self-exclusion)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      patron: 'netflix renombrado',
    });

    expect(repo.existePatron).toHaveBeenCalledWith(
      'user-1',
      'netflix renombrado',
      'patron-1',
    );
  });

  it('rechaza una colisión de patron con otro del mismo usuario (409)', async () => {
    const repo = makeRepo({
      existePatron: vi.fn().mockResolvedValue(true),
    });
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      patron: 'spotify',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronDuplicadoError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('rechaza un matchType inválido', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      matchType: 'FUZZY',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MatchTypeInvalidoError);
  });

  it('rechaza una REGEX que no compila al pasar matchType: REGEX', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      matchType: 'REGEX',
      patron: '(',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RegexInvalidaError);
  });

  it('rechaza una REGEX que no compila incluso si solo se cambia matchType (patron actual queda vigente)', async () => {
    const repo = makeRepo({
      buscarPorId: vi.fn().mockResolvedValue({ ...PATRON_ACTUAL, patron: '(' }),
    });
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      matchType: 'REGEX',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RegexInvalidaError);
  });

  it('rechaza una prioridad fuera de rango', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'patron-1',
      prioridad: 1000,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadInvalidaError);
  });

  it('categoriaId NO es aceptado — mover un patrón entre categorías es un non-goal', () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo);

    const llamadaInvalida = () =>
      useCase.execute({
        userId: 'user-1',
        esDemo: false,
        id: 'patron-1',
        // @ts-expect-error — ActualizarPatronUseCase no declara categoriaId en su input
        categoriaId: 'otra-cat',
      });
    void llamadaInvalida;
  });
});
