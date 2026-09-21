import { EliminarCategoriaUseCase } from './eliminar-categoria.use-case';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';

/** Categoría común del usuario: la que SÍ se puede borrar. */
const CATEGORIA: CategoriaConPatrones = {
  id: 'cat-1',
  nombre: 'Mascotas',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
  icono: null,
  esInterna: false,
};

/**
 * `buscarPorId` dejó de ser un stub inerte (#778): el use case ahora LEE la
 * fila antes de borrarla, para saber si está protegida. El default devuelve
 * una categoría común, así que los casos que no hablan de protección se leen
 * igual que antes.
 */
function makeRepo(
  eliminar: ICategoriaRepository['eliminar'],
  buscarPorId: ICategoriaRepository['buscarPorId'] = vi
    .fn()
    .mockResolvedValue(CATEGORIA),
): ICategoriaRepository {
  return {
    listarConPatrones: vi.fn(),
    buscarPorId,
    existeNombre: vi.fn(),
    crearConPatrones: vi.fn(),
    actualizar: vi.fn(),
    eliminar,
  };
}

describe('EliminarCategoriaUseCase', () => {
  it('el demo gate corta ANTES de llamar al repositorio', async () => {
    const eliminar = vi.fn();
    const buscarPorId = vi.fn();
    const repo = makeRepo(eliminar, buscarPorId);
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CatalogoDemoSoloLecturaError);
    expect(eliminar).not.toHaveBeenCalled();
    // El demo gate corta antes de TODO, también de la lectura nueva.
    expect(buscarPorId).not.toHaveBeenCalled();
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

  it('devuelve CategoriaNoEncontradaError (404) cuando la fila no es del caller', async () => {
    const eliminar = vi.fn();
    const repo = makeRepo(eliminar, vi.fn().mockResolvedValue(null));
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('propaga el CategoriaNoEncontradaError del adapter si la fila desaparece entre la lectura y el delete', async () => {
    // La carrera que la lectura previa NO elimina: el adapter sigue siendo la
    // autoridad final de pertenencia, y su 404 tiene que llegar al caller.
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

  // #778 — el caso que este cambio existe para cubrir.
  it('rechaza borrar una categoría interna y NUNCA llama al repositorio', async () => {
    const eliminar = vi.fn();
    const repo = makeRepo(
      eliminar,
      vi.fn().mockResolvedValue({ ...CATEGORIA, esInterna: true }),
    );
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaInternaProtegidaError);
    // Lo que de verdad importa: el delete no ocurrió. Un rechazo que igual
    // borra la fila sería peor que no tener el gate.
    expect(eliminar).not.toHaveBeenCalled();
  });
});
