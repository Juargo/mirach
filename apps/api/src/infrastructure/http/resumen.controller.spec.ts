import { InternalServerErrorException } from '@nestjs/common';
import { ResumenController } from './resumen.controller';
import { CalcularResumenMesUseCase } from '../../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../../application/use-cases/calcular-resumen-anual.use-case';
import { Result } from '../../shared/result';
import { ResumenMes } from '../../domain/value-objects/resumen-mes';
import { ResumenAnual } from '../../domain/value-objects/resumen-anual';
import { AnioInvalidoError } from '../../domain/errors/anio-invalido.error';

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

function mesVacio(): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: 0n,
    necesidades: 0n,
    deseos: 0n,
    ahorro: 0n,
    sinCategoria: 0n,
  });
}

function resultadoAnualVacio() {
  return Result.ok({
    anio: 2026,
    resumenAnual: ResumenAnual.crear(
      2026,
      Array.from({ length: 12 }, () => mesVacio()),
    ).getValue(),
  });
}

function makeMesUseCase(): CalcularResumenMesUseCase {
  return {
    execute: vi.fn().mockResolvedValue(resultadoVacio()),
  } as unknown as CalcularResumenMesUseCase;
}

function makeAnualUseCase(): CalcularResumenAnualUseCase {
  return {
    execute: vi.fn().mockResolvedValue(resultadoAnualVacio()),
  } as unknown as CalcularResumenAnualUseCase;
}

describe('ResumenController', () => {
  describe('GET /api/resumen (mensual)', () => {
    it('deriva userId de @CurrentUser() y lo pasa al use case (ISO-01/02) en vez de USER_ID_FIJO', async () => {
      const useCase = makeMesUseCase();
      const controller = new ResumenController(useCase, makeAnualUseCase());

      await controller.obtener('2026-07', 'user-autenticado-1');

      expect(useCase.execute).toHaveBeenCalledWith({
        userId: 'user-autenticado-1',
        periodo: '2026-07',
      });
    });

    it('dos requests con userId distinto pasan userIds distintos al use case (ISO-02)', async () => {
      const useCase = makeMesUseCase();
      const controller = new ResumenController(useCase, makeAnualUseCase());

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
      const controller = new ResumenController(useCase, makeAnualUseCase());

      await expect(
        controller.obtener('2026-07', 'user-autenticado-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('GET /api/resumen/anual', () => {
    it('deriva userId de @CurrentUser() y lo pasa al use case anual (ISO-01/02)', async () => {
      const useCase = makeAnualUseCase();
      const controller = new ResumenController(makeMesUseCase(), useCase);

      await controller.obtenerAnual('2026', 'user-autenticado-1');

      expect(useCase.execute).toHaveBeenCalledWith({
        userId: 'user-autenticado-1',
        anio: '2026',
      });
    });

    it('dos requests con userId distinto pasan userIds distintos al use case anual (ISO-02)', async () => {
      const useCase = makeAnualUseCase();
      const controller = new ResumenController(makeMesUseCase(), useCase);

      await controller.obtenerAnual(undefined, 'user-a');
      await controller.obtenerAnual(undefined, 'user-b');

      expect(useCase.execute).toHaveBeenNthCalledWith(1, {
        userId: 'user-a',
        anio: undefined,
      });
      expect(useCase.execute).toHaveBeenNthCalledWith(2, {
        userId: 'user-b',
        anio: undefined,
      });
    });

    it('anio inválido → 400 (BadRequestException), raw value never reflected', async () => {
      const useCase = {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new AnioInvalidoError(1999))),
      } as unknown as CalcularResumenAnualUseCase;
      const controller = new ResumenController(makeMesUseCase(), useCase);

      await expect(
        controller.obtenerAnual('1999', 'user-autenticado-1'),
      ).rejects.toMatchObject({
        response: { statusCode: 400 },
      });
    });

    it('error inesperado del use case anual (throw): 500 genérico', async () => {
      const useCase = {
        execute: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      } as unknown as CalcularResumenAnualUseCase;
      const controller = new ResumenController(makeMesUseCase(), useCase);

      await expect(
        controller.obtenerAnual('2026', 'user-autenticado-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('respuesta exitosa devuelve el DTO anual con 12 meses', async () => {
      const controller = new ResumenController(
        makeMesUseCase(),
        makeAnualUseCase(),
      );

      const dto = await controller.obtenerAnual('2026', 'user-a');

      expect(dto.anio).toBe(2026);
      expect(dto.meses).toHaveLength(12);
    });
  });
});
