import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DetalleBucketController } from './detalle-bucket.controller';
import { ObtenerDetalleBucketUseCase } from '../../application/use-cases/obtener-detalle-bucket.use-case';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';

function controllerWithResult(
  result: Result<unknown, Error>,
): DetalleBucketController {
  const useCase = {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as ObtenerDetalleBucketUseCase;
  return new DetalleBucketController(useCase, 'user-fijo-test');
}

describe('DetalleBucketController', () => {
  it('bucket válido + periodo válido: 200 con el DTO mapeado', async () => {
    const result = Result.ok({
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [
        {
          id: 'tx-1',
          fecha: new Date('2026-07-10T00:00:00.000Z'),
          descripcion: 'Compra',
          cargo: 50000n,
          abono: 0n,
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: '123',
        },
      ],
    });
    const controller = controllerWithResult(result);

    const dto = await controller.obtener(Bucket.Necesidades, '2026-07');

    expect(dto.periodo).toBe('2026-07');
    expect(dto.bucket).toBe(Bucket.Necesidades);
    expect(dto.transacciones[0]!.cargo).toBe('50000');
  });

  it('BucketInvalidoError: 400 y el body NUNCA refleja el valor crudo de :bucket', async () => {
    const error = new BucketInvalidoError('nope-invalido');
    const controller = controllerWithResult(Result.fail(error));

    try {
      await controller.obtener('nope-invalido' as Bucket, '2026-07');
      throw new Error('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const message = (e as BadRequestException).message;
      expect(message).not.toContain('nope-invalido');
    }
  });

  it('PeriodoInvalidoError: 400 y el body NUNCA refleja el valor crudo de periodo', async () => {
    const error = new PeriodoInvalidoError('not-a-date');
    const controller = controllerWithResult(Result.fail(error));

    try {
      await controller.obtener(Bucket.Necesidades, 'not-a-date');
      throw new Error('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const message = (e as BadRequestException).message;
      expect(message).not.toContain('not-a-date');
    }
  });

  it('error inesperado del use case (throw): 500 genérico, causa real solo loggeada server-side', async () => {
    const useCase = {
      execute: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    } as unknown as ObtenerDetalleBucketUseCase;
    const controller = new DetalleBucketController(useCase, 'user-fijo-test');

    await expect(
      controller.obtener(Bucket.Necesidades, '2026-07'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('periodo ausente: delega al use case con periodo undefined', async () => {
    const result = Result.ok({
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [],
    });
    const useCase = {
      execute: vi.fn().mockResolvedValue(result),
    } as unknown as ObtenerDetalleBucketUseCase;
    const controller = new DetalleBucketController(useCase, 'user-fijo-test');

    await controller.obtener(Bucket.Necesidades, undefined);

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'user-fijo-test',
      bucket: Bucket.Necesidades,
      periodo: undefined,
    });
  });
});
