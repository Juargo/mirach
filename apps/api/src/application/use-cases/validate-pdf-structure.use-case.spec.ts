import type { Mock } from 'vitest';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';

describe('ValidatePdfStructureUseCase', () => {
  it('delega en el IPdfStructureValidator inyectado y retorna su resultado', async () => {
    const validada: EstructuraPdfValidada = {
      banco: BancoConocido.BancoEstado,
      periodo: { desde: '2026-04-01', hasta: '2026-04-30' },
      paginaInicioTabla: 1,
      rangosX: [{ col: 'fecha', xMin: 0, xMax: 50 }],
      toleranciaY: 2,
    };
    const validator: IPdfStructureValidator = {
      validate: vi.fn().mockResolvedValue(Result.ok(validada)),
    };
    const useCase = new ValidatePdfStructureUseCase(validator);
    const buffer = Buffer.from('contenido');

    const result = await useCase.execute(buffer, BancoConocido.BancoEstado);

    expect(validator.validate as Mock).toHaveBeenCalledWith(
      buffer,
      BancoConocido.BancoEstado,
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(validada);
  });

  it('propaga el Result.fail del validator sin modificarlo', async () => {
    const error = new RangoFechasInvalidoError('BancoEstado');
    const validator: IPdfStructureValidator = {
      validate: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = new ValidatePdfStructureUseCase(validator);

    const result = await useCase.execute(
      Buffer.from(''),
      BancoConocido.BancoEstado,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });
});
