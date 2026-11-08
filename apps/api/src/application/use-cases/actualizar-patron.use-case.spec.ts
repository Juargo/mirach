import { ActualizarPatronUseCase } from './actualizar-patron.use-case';
import { IPatronRepository } from '../ports/patron-repository.port';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';

/** CLA-17: the pattern that already holds the text, with its category. */
const EXISTENTE = {
  patronId: 'patron-existente',
  categoriaId: 'cat-otra',
  categoria: 'Otra',
  bucket: 'Deseos' as never,
};

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
    buscarPorTexto: vi.fn().mockResolvedValue(null),
    crear: vi.fn(),
    actualizar: vi
      .fn()
      .mockResolvedValue({ ...PATRON_ACTUAL, patron: 'netflix renombrado' }),
    eliminar: vi.fn(),
    ...overrides,
  };
}

function makeCategoriaRepo(
  categoria: { esInterna: boolean } | null = { esInterna: false },
): ICategoriaRepository {
  return {
    buscarPorId: vi
      .fn()
      .mockResolvedValue(
        categoria === null ? null : { id: 'cat-2', ...categoria },
      ),
  } as unknown as ICategoriaRepository;
}

describe('ActualizarPatronUseCase — mover de categoría (CLA-17, S5)', () => {
  it('moves the pattern to another category of the caller; only categoriaId changes', async () => {
    const repo = makeRepo();
    const categorias = makeCategoriaRepo();
    const useCase = new ActualizarPatronUseCase(repo, categorias);

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      categoriaId: 'cat-2',
    });

    expect(result.isOk()).toBe(true);
    expect(categorias.buscarPorId).toHaveBeenCalledWith('user-1', 'cat-2');
    // Same row (same id, so `creadoEn` stays): only the category is patched.
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'patron-1', {
      categoriaId: 'cat-2',
    });
  });

  it("404 CATEGORIA_NO_ENCONTRADA when the target is not the caller's", async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo(null));

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      categoriaId: 'cat-ajena',
    });

    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('403 on an internal target category (CLA-18)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(
      repo,
      makeCategoriaRepo({ esInterna: true }),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      categoriaId: 'cat-desconocido',
    });

    expect(result.getError()).toBeInstanceOf(CategoriaInternaProtegidaError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('a PATCH without categoriaId never reads the categories (previous behavior)', async () => {
    const repo = makeRepo();
    const categorias = makeCategoriaRepo();
    const useCase = new ActualizarPatronUseCase(repo, categorias);

    await useCase.execute({ userId: 'user-1', id: 'patron-1', prioridad: 5 });

    expect(categorias.buscarPorId).not.toHaveBeenCalled();
    expect(repo.actualizar).toHaveBeenCalledWith('user-1', 'patron-1', {
      prioridad: 5,
    });
  });
});

describe('ActualizarPatronUseCase', () => {
  it('404 cuando el patrón es ajeno o no existe', async () => {
    const repo = makeRepo({ buscarPorId: vi.fn().mockResolvedValue(null) });
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-ajeno',
      patron: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronNoEncontradoError);
  });

  it('body parcial: solo patron es válido (Q4)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
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
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
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
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      patron: '   ',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronInvalidoError);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('la unicidad de patron EXCLUYE la propia fila (self-exclusion)', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      patron: 'netflix renombrado',
    });

    expect(repo.buscarPorTexto).toHaveBeenCalledWith(
      'user-1',
      'netflix renombrado',
      'patron-1',
    );
  });

  it('rechaza una colisión de patron con otro del mismo usuario (409)', async () => {
    const repo = makeRepo({
      buscarPorTexto: vi.fn().mockResolvedValue(EXISTENTE),
    });
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      patron: 'spotify',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PatronDuplicadoError);
    expect((result.getError() as PatronDuplicadoError).existente).toEqual(
      EXISTENTE,
    );
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('rechaza un matchType inválido', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      matchType: 'FUZZY',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MatchTypeInvalidoError);
  });

  it('rechaza una REGEX que no compila al pasar matchType: REGEX', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
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
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      matchType: 'REGEX',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RegexInvalidaError);
  });

  it('rechaza una prioridad fuera de rango', async () => {
    const repo = makeRepo();
    const useCase = new ActualizarPatronUseCase(repo, makeCategoriaRepo());

    const result = await useCase.execute({
      userId: 'user-1',
      id: 'patron-1',
      prioridad: 1000,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadInvalidaError);
  });
});
