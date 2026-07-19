import { ReclasificarTransaccionUseCase } from './reclasificar-transaccion.use-case';
import { IReclasificarCategoriaWriter } from '../ports/reclasificar-categoria.port';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { CategoriaInvalidaError } from '../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWriter(
  result: Result<
    { id: string; categoria: Categoria; bucket: Bucket },
    TransaccionNoEncontradaError
  >,
): IReclasificarCategoriaWriter {
  return {
    reasignar: vi.fn().mockResolvedValue(result),
  };
}

describe('ReclasificarTransaccionUseCase', () => {
  it('T4.1a: deriva el bucket desde la categoría elegida — NUNCA la acepta del caller', async () => {
    const writer = makeWriter(
      Result.ok({ id: 'tx-1', categoria: Categoria.Transporte, bucket: Bucket.Necesidades }),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'Transporte',
    });

    expect(result.isOk()).toBe(true);
    // El writer SOLO recibe categoria + bucket ya derivado — nunca un bucket
    // provisto por el caller (el input del use case no tiene campo `bucket`).
    expect(writer.reasignar).toHaveBeenCalledWith(
      'user-a',
      'tx-1',
      Categoria.Transporte,
      Bucket.Necesidades, // derivado vía CATEGORIA_BUCKET, no aceptado
    );
  });

  it('T4.1b: cada categoría del enum deriva el bucket esperado (invariante, no switch)', async () => {
    const casos: Array<[Categoria, Bucket]> = [
      [Categoria.Supermercado, Bucket.Necesidades],
      [Categoria.Combustible, Bucket.Necesidades],
      [Categoria.Farmacia, Bucket.Necesidades],
      [Categoria.Salud, Bucket.Necesidades],
      [Categoria.Transporte, Bucket.Necesidades],
      [Categoria.Streaming, Bucket.Deseos],
      [Categoria.Delivery, Bucket.Deseos],
      [Categoria.Ahorro, Bucket.Ahorro],
    ];

    for (const [categoria, bucketEsperado] of casos) {
      const writer = makeWriter(Result.ok({ id: 'tx-1', categoria, bucket: bucketEsperado }));
      const useCase = new ReclasificarTransaccionUseCase(writer);

      await useCase.execute({ userId: 'user-a', transaccionId: 'tx-1', categoria });

      expect(writer.reasignar).toHaveBeenCalledWith('user-a', 'tx-1', categoria, bucketEsperado);
    }
  });

  it('T4.1c: categoría desconocida → CategoriaInvalidaError, el writer NUNCA se invoca', async () => {
    const writer = makeWriter(
      Result.ok({ id: 'tx-1', categoria: Categoria.Transporte, bucket: Bucket.Necesidades }),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'NoExiste',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategoriaInvalidaError);
    expect(writer.reasignar).not.toHaveBeenCalled();
  });

  it('T4.1d: el mensaje del error NUNCA refleja el valor crudo de categoría (anti-reflected-input)', async () => {
    const writer = makeWriter(
      Result.ok({ id: 'tx-1', categoria: Categoria.Transporte, bucket: Bucket.Necesidades }),
    );
    const useCase = new ReclasificarTransaccionUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: '<script>alert(1)</script>',
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError() as CategoriaInvalidaError;
    expect(error.message).not.toContain('<script>');
  });

  it('T4.1e: propaga el TransaccionNoEncontradaError del writer (not-found o not-owned, indistinguible)', async () => {
    const writer = makeWriter(Result.fail(new TransaccionNoEncontradaError('tx-ajena')));
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
