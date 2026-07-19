import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { ReclasificarTransaccionUseCase } from '../../application/use-cases/reclasificar-transaccion.use-case';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { CategoriaInvalidaError } from '../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

function controllerWithResult(
  result: Result<unknown, Error>,
): TransaccionesController {
  const useCase = {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as ReclasificarTransaccionUseCase;
  return new TransaccionesController(useCase);
}

describe('TransaccionesController', () => {
  it('categoría válida + tx propia: 200 con el DTO mapeado (categoria {id,nombre} + bucket)', async () => {
    const result = Result.ok({ id: 'tx-1', categoria: Categoria.Transporte, bucket: Bucket.Necesidades });
    const controller = controllerWithResult(result);

    const dto = await controller.reclasificar(
      'tx-1',
      { categoria: 'Transporte' },
      'user-fijo-test',
    );

    expect(dto).toEqual({
      id: 'tx-1',
      categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
      bucket: 'Necesidades',
    });
  });

  it('deriva userId de @CurrentUser() y lo pasa al use case junto con :id y el body', async () => {
    const result = Result.ok({ id: 'tx-1', categoria: Categoria.Transporte, bucket: Bucket.Necesidades });
    const useCase = { execute: vi.fn().mockResolvedValue(result) } as unknown as ReclasificarTransaccionUseCase;
    const controller = new TransaccionesController(useCase);

    await controller.reclasificar('tx-1', { categoria: 'Transporte' }, 'user-a');

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: 'Transporte',
    });
  });

  it('body sin categoria (o no-string): pasa string vacío al use case, nunca undefined/objeto crudo', async () => {
    const result = Result.fail(new CategoriaInvalidaError(''));
    const useCase = { execute: vi.fn().mockResolvedValue(result) } as unknown as ReclasificarTransaccionUseCase;
    const controller = new TransaccionesController(useCase);

    await expect(
      controller.reclasificar('tx-1', {}, 'user-a'),
    ).rejects.toThrow(BadRequestException);

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      transaccionId: 'tx-1',
      categoria: '',
    });
  });

  it('CategoriaInvalidaError: 400 y el body NUNCA refleja el valor crudo de categoria', async () => {
    const error = new CategoriaInvalidaError('<script>nope</script>');
    const controller = controllerWithResult(Result.fail(error));

    try {
      await controller.reclasificar('tx-1', { categoria: '<script>nope</script>' }, 'user-a');
      throw new Error('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const message = (e as BadRequestException).message;
      expect(message).not.toContain('<script>');
    }
  });

  it('TransaccionNoEncontradaError: 404 (not-found y not-owned son indistinguibles)', async () => {
    const error = new TransaccionNoEncontradaError('tx-ajena');
    const controller = controllerWithResult(Result.fail(error));

    await expect(
      controller.reclasificar('tx-ajena', { categoria: 'Transporte' }, 'user-a'),
    ).rejects.toThrow(NotFoundException);
  });

  it('error inesperado del use case (throw): 500 genérico, causa real solo loggeada server-side', async () => {
    const useCase = {
      execute: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    } as unknown as ReclasificarTransaccionUseCase;
    const controller = new TransaccionesController(useCase);

    await expect(
      controller.reclasificar('tx-1', { categoria: 'Transporte' }, 'user-a'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
