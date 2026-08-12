import { ReclasificarTransaccionUseCase } from './reclasificar-transaccion.use-case';
import { IReclasificarCategoriaWriter } from '../ports/reclasificar-categoria.port';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWriter(
  result: Result<
    { id: string; categoriaId: string; categoria: string; bucket: Bucket },
    TransaccionNoEncontradaError | CategoriaDesconocidaError
  >,
): IReclasificarCategoriaWriter {
  return {
    reasignar: vi.fn().mockResolvedValue(result),
  };
}

/**
 * ReclasificarTransaccionUseCase — CAT037-04 (ADR-037/Q5): el use case deja
 * de validar la categoría cruda contra un enum cerrado y de derivar el
 * bucket vía `CATEGORIA_BUCKET` — ambos retirados. Se vuelve un delegado
 * puro: pasa `nombre` al writer sin gating, y el writer (contra el catálogo
 * REAL del usuario) resuelve id + bucket o falla con `CategoriaDesconocidaError`.
 */
describe('ReclasificarTransaccionUseCase', () => {
  it('T4.1a: delega sin ningún gating de enum — el writer recibe el nombre crudo tal cual', async () => {
    const writer = makeWriter(
      Result.ok({
        id: 'tx-1',
        categoriaId: 'cat-transporte-row-id',
        categoria: 'Transporte',
        bucket: Bucket.Necesidades,
      }),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'Transporte',
    });

    expect(result.isOk()).toBe(true);
    expect(writer.reasignar).toHaveBeenCalledWith(
      'user-a',
      'tx-1',
      'Transporte',
    );
  });

  it('T4.1b: delega cualquier nombre, incluido uno fuera del template original (categoría custom del usuario)', async () => {
    const writer = makeWriter(
      Result.ok({
        id: 'tx-1',
        categoriaId: 'cat-mascotas-row-id',
        categoria: 'Mascotas',
        bucket: Bucket.Deseos,
      }),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'Mascotas',
    });

    expect(result.isOk()).toBe(true);
    expect(writer.reasignar).toHaveBeenCalledWith('user-a', 'tx-1', 'Mascotas');
  });

  it('T4.1c: un nombre que no resuelve en el catálogo del usuario → propaga CategoriaDesconocidaError del writer', async () => {
    const writer = makeWriter(
      Result.fail(new CategoriaDesconocidaError('NoExiste')),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'NoExiste',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaDesconocidaError);
  });

  it('T4.1e: propaga el TransaccionNoEncontradaError del writer (not-found o not-owned, indistinguible)', async () => {
    const writer = makeWriter(
      Result.fail(new TransaccionNoEncontradaError('tx-ajena')),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-ajena',
      categoria: 'Transporte',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
  });
});
