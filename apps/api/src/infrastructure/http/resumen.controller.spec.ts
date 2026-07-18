import { InternalServerErrorException } from '@nestjs/common';
import { ResumenController } from './resumen.controller';
import { CalcularResumenMesUseCase } from '../../application/use-cases/calcular-resumen-mes.use-case';
import { Result } from '../../shared/result';
import { ResumenMes } from '../../domain/value-objects/resumen-mes';

function resultadoVacio() {
  return Result.ok({
    periodo: '2026-07',
    resumen: ResumenMes.crear({
      totalIngreso: 0n,
      necesidades: 0n,
      deseos: 0n,
      ahorro: 0n,
      sinCategoria: 0n,
    }),
  });
}

describe('ResumenController', () => {
  it('deriva userId de @CurrentUser() y lo pasa al use case (ISO-01/02) en vez de USER_ID_FIJO', async () => {
    const useCase = {
      execute: vi.fn().mockResolvedValue(resultadoVacio()),
    } as unknown as CalcularResumenMesUseCase;
    const controller = new ResumenController(useCase);

    await controller.obtener('2026-07', 'user-autenticado-1');

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'user-autenticado-1',
      periodo: '2026-07',
    });
  });

  it('dos requests con userId distinto pasan userIds distintos al use case (ISO-02)', async () => {
    const useCase = {
      execute: vi.fn().mockResolvedValue(resultadoVacio()),
    } as unknown as CalcularResumenMesUseCase;
    const controller = new ResumenController(useCase);

    await controller.obtener(undefined, 'user-a');
    await controller.obtener(undefined, 'user-b');

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
    } as unknown as CalcularResumenMesUseCase;
    const controller = new ResumenController(useCase);

    await expect(
      controller.obtener('2026-07', 'user-autenticado-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
