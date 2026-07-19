import { InternalServerErrorException } from '@nestjs/common';
import { MovimientosController } from './movimientos.controller';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';

function resultadoVacio() {
  return Result.ok({ periodo: '2026-07', transacciones: [] });
}

describe('MovimientosController', () => {
  it('deriva userId de @CurrentUser() y lo pasa al use case (ISO-01/02) en vez de USER_ID_FIJO', async () => {
    const useCase = {
      execute: vi.fn().mockResolvedValue(resultadoVacio()),
    } as unknown as ObtenerMovimientosMesUseCase;
    const controller = new MovimientosController(useCase);

    await controller.listar('2026-07', 'user-autenticado-1');

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'user-autenticado-1',
      periodo: '2026-07',
    });
  });

  it('dos requests con userId distinto pasan userIds distintos al use case (ISO-02)', async () => {
    const useCase = {
      execute: vi.fn().mockResolvedValue(resultadoVacio()),
    } as unknown as ObtenerMovimientosMesUseCase;
    const controller = new MovimientosController(useCase);

    await controller.listar(undefined, 'user-a');
    await controller.listar(undefined, 'user-b');

    expect(useCase.execute).toHaveBeenNthCalledWith(1, {
      userId: 'user-a',
      periodo: undefined,
    });
    expect(useCase.execute).toHaveBeenNthCalledWith(2, {
      userId: 'user-b',
      periodo: undefined,
    });
  });

  it('error inesperado del use case (throw): 500 genérico', async () => {
    const useCase = {
      execute: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    } as unknown as ObtenerMovimientosMesUseCase;
    const controller = new MovimientosController(useCase);

    await expect(
      controller.listar('2026-07', 'user-autenticado-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('MOV-01: el DTO expone el bucket foldeado (dominio), nunca el bucketId físico crudo', async () => {
    const useCase = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          periodo: '2026-07',
          transacciones: [
            {
              id: 'tx-1',
              fecha: new Date('2026-07-10T00:00:00.000Z'),
              descripcion: 'Compra supermercado',
              cargo: 50000n,
              abono: 0n,
              banco: 'BCI',
              tipoCuenta: 'Cuenta Corriente',
              numeroCuenta: '12345678',
              bucket: Bucket.Necesidades,
            },
            {
              id: 'tx-2',
              fecha: new Date('2026-07-11T00:00:00.000Z'),
              descripcion: 'Sin categorizar',
              cargo: 5000n,
              abono: 0n,
              banco: 'BCI',
              tipoCuenta: 'Cuenta Corriente',
              numeroCuenta: '12345678',
              bucket: Bucket.SinCategoria,
            },
          ],
        }),
      ),
    } as unknown as ObtenerMovimientosMesUseCase;
    const controller = new MovimientosController(useCase);

    const response = await controller.listar('2026-07', 'user-autenticado-1');

    expect(response.transacciones[0]).toMatchObject({ bucket: 'Necesidades' });
    expect(response.transacciones[1]).toMatchObject({ bucket: 'SinCategoria' });
    expect(response.transacciones[0]).not.toHaveProperty('bucketId');
    expect(response.transacciones[1]).not.toHaveProperty('bucketId');
  });
});
