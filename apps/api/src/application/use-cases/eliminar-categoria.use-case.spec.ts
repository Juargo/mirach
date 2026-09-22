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

/** La `Desconocido` de Deseos — el mismo bucket que `CATEGORIA`. */
const DESCONOCIDO_DESEOS: CategoriaConPatrones = {
  id: 'cat-desconocido-deseos',
  nombre: 'Desconocido',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
  icono: null,
  esInterna: true,
};

/** La `Desconocido` de Necesidades — OTRO bucket, nunca debería elegirse para `CATEGORIA`. */
const DESCONOCIDO_NECESIDADES: CategoriaConPatrones = {
  id: 'cat-desconocido-necesidades',
  nombre: 'Desconocido',
  bucket: Bucket.Necesidades,
  patrones: [],
  transaccionesCount: 0,
  icono: null,
  esInterna: true,
};

/**
 * `buscarPorId` dejó de ser un stub inerte (#778): el use case ahora LEE la
 * fila antes de borrarla, para saber si está protegida. El default devuelve
 * una categoría común, así que los casos que no hablan de protección se leen
 * igual que antes.
 *
 * `listarConPatrones` (tramo 3) por default trae el catálogo completo con la
 * `Desconocido` de AMBOS buckets — así un test que no habla de reasignación
 * sigue viendo el flujo feliz (encuentra la de Deseos, ignora la de
 * Necesidades) sin tener que declarar el catálogo a mano.
 */
function makeRepo(
  eliminar: ICategoriaRepository['eliminar'],
  buscarPorId: ICategoriaRepository['buscarPorId'] = vi
    .fn()
    .mockResolvedValue(CATEGORIA),
  listarConPatrones: ICategoriaRepository['listarConPatrones'] = vi
    .fn()
    .mockResolvedValue([DESCONOCIDO_DESEOS, DESCONOCIDO_NECESIDADES]),
): ICategoriaRepository {
  return {
    listarConPatrones,
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
    const listarConPatrones = vi.fn();
    const repo = makeRepo(eliminar, buscarPorId, listarConPatrones);
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
    expect(listarConPatrones).not.toHaveBeenCalled();
  });

  it('delega en el repositorio con userId + id + el id de la Desconocido del MISMO bucket, y propaga Result.ok', async () => {
    const eliminar = vi.fn().mockResolvedValue(Result.ok(undefined));
    const repo = makeRepo(eliminar);
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isOk()).toBe(true);
    // CATEGORIA es de Deseos ⇒ el destino tiene que ser DESCONOCIDO_DESEOS,
    // NUNCA DESCONOCIDO_NECESIDADES aunque esté en el mismo catálogo.
    expect(eliminar).toHaveBeenCalledWith(
      'user-1',
      'cat-1',
      'cat-desconocido-deseos',
    );
  });

  it('reasignarA es null cuando el catálogo no tiene una Desconocido en el bucket de la categoría borrada — degrada al SetNull histórico', async () => {
    const eliminar = vi.fn().mockResolvedValue(Result.ok(undefined));
    // Catálogo sin ninguna Desconocido de Deseos (solo la de Necesidades).
    const repo = makeRepo(
      eliminar,
      undefined,
      vi.fn().mockResolvedValue([DESCONOCIDO_NECESIDADES]),
    );
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isOk()).toBe(true);
    expect(eliminar).toHaveBeenCalledWith('user-1', 'cat-1', null);
  });

  it('devuelve CategoriaNoEncontradaError (404) cuando la fila no es del caller, y NUNCA llega a listar el catálogo ni a reasignar', async () => {
    const eliminar = vi.fn();
    const listarConPatrones = vi.fn();
    const repo = makeRepo(
      eliminar,
      vi.fn().mockResolvedValue(null),
      listarConPatrones,
    );
    const useCase = new EliminarCategoriaUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      id: 'cat-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    expect(eliminar).not.toHaveBeenCalled();
    expect(listarConPatrones).not.toHaveBeenCalled();
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
  it('rechaza borrar una categoría interna y NUNCA llama al repositorio (ni a listar el catálogo, ni a eliminar)', async () => {
    const eliminar = vi.fn();
    const listarConPatrones = vi.fn();
    const repo = makeRepo(
      eliminar,
      vi.fn().mockResolvedValue({ ...CATEGORIA, esInterna: true }),
      listarConPatrones,
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
    expect(listarConPatrones).not.toHaveBeenCalled();
  });
});
