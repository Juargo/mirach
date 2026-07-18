import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { IngestaController } from './ingesta.controller';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { Result } from '../../shared/result';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

function fakeMulterFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('contenido'),
    originalname: 'movimientos.xlsx',
    size: 100,
  } as Express.Multer.File;
}

function controllerWithResult(
  result: Result<unknown, Error>,
): IngestaController {
  const useCase = {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as ProcessIngestaUseCase;
  return new IngestaController(useCase);
}

describe('IngestaController', () => {
  it('sin archivo: 400 sin invocar el orquestador', async () => {
    const useCase = { execute: vi.fn() } as unknown as ProcessIngestaUseCase;
    const controller = new IngestaController(useCase);

    await expect(
      controller.ingestar(
        undefined as unknown as Express.Multer.File,
        'user-fijo-test',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('deriva userId de @CurrentUser(): lo pasa al orquestador en vez de USER_ID_FIJO (ISO-01/02)', async () => {
    const result = Result.ok({
      ingestaId: 'ing-1',
      banco: { banco: 'BCI', tipoCuenta: 'Cuenta Corriente', numeroCuenta: '123' },
      archivo: { originalName: 'movimientos.xlsx', extension: '.xlsx', sizeInBytes: 100 },
      total: 0,
      transacciones: [],
    });
    const useCase = {
      execute: vi.fn().mockResolvedValue(result),
    } as unknown as ProcessIngestaUseCase;
    const controller = new IngestaController(useCase);

    await controller.ingestar(fakeMulterFile(), 'user-autenticado-1');

    expect(useCase.execute).toHaveBeenCalledWith({
      fileReader: expect.anything(),
      userId: 'user-autenticado-1',
    });
  });

  it('monto ininterpretable: 400 y el mensaje NUNCA filtra el valor crudo de la celda (podría ser dinero)', async () => {
    const error = new NormalizacionInvalidaError('BancoEstado', [
      { tipo: 'MontoIninterpretable', fila: 9, columna: 'Cargo' },
    ]);
    const controller = controllerWithResult(Result.fail(error));

    try {
      await controller.ingestar(fakeMulterFile(), 'user-fijo-test');
      throw new Error('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const message = (e as BadRequestException).message;
      expect(message).not.toContain('1.500.000,00');
      expect(message).toContain('Fila 9');
      expect(message).toContain('columna "Cargo"');
    }
  });

  it('extensión no permitida: 400', async () => {
    const error = new ExtensionNoPermitidaError('.xls', ['.xlsx']);
    const controller = controllerWithResult(Result.fail(error));

    await expect(controller.ingestar(fakeMulterFile(), 'user-fijo-test')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('banco no reconocido: 400', async () => {
    const error = new BancoNoReconocidoError('movimientos.xlsx');
    const controller = controllerWithResult(Result.fail(error));

    await expect(controller.ingestar(fakeMulterFile(), 'user-fijo-test')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('estructura inválida: 400', async () => {
    const error = new EstructuraInvalidaError('BancoEstado', [
      { tipo: 'SinEncabezados', fila: 1 },
    ]);
    const controller = controllerWithResult(Result.fail(error));

    await expect(controller.ingestar(fakeMulterFile(), 'user-fijo-test')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('fallo de persistencia (infraestructura): 500, no 400', async () => {
    const error = new PersistenciaFallidaError(
      'falló la escritura atómica de transacciones',
    );
    const controller = controllerWithResult(Result.fail(error));

    await expect(controller.ingestar(fakeMulterFile(), 'user-fijo-test')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
