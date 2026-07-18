import { InternalServerErrorException } from '@nestjs/common';
import { MovimientosController } from './movimientos.controller';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import { Result } from '../../shared/result';

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
});
