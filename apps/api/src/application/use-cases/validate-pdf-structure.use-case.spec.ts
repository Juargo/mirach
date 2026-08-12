import type { Mock } from 'vitest';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

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
    const useCase = new ValidatePdfStructureUseCase(
      validator,
      new NoOpLogger(),
    );
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
    const useCase = new ValidatePdfStructureUseCase(
      validator,
      new NoOpLogger(),
    );

    const result = await useCase.execute(
      Buffer.from(''),
      BancoConocido.BancoEstado,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea problemasCount=1 para RangoFechasInvalidoError (sin campo problemas)', async () => {
      const error = new RangoFechasInvalidoError('BancoEstado');
      const validator: IPdfStructureValidator = {
        validate: vi.fn().mockResolvedValue(Result.fail(error)),
      };
      const logger = new FakeLogger();
      const useCase = new ValidatePdfStructureUseCase(validator, logger);

      await useCase.execute(Buffer.from(''), BancoConocido.BancoEstado);

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'validate-pdf-structure: structure validation outcome',
          context: { valido: false, problemasCount: 1 },
        },
      ]);
    });

    it('loguea el conteo de problemas de EstructuraPdfInvalidaError, nunca el detalle crudo', async () => {
      const error = new EstructuraPdfInvalidaError(BancoConocido.BancoEstado, [
        { tipo: 'AnclaFaltante', ancla: 'Fecha' },
        { tipo: 'MontoIleeible', fila: 3, columna: 'cargo' },
      ]);
      const validator: IPdfStructureValidator = {
        validate: vi.fn().mockResolvedValue(Result.fail(error)),
      };
      const logger = new FakeLogger();
      const useCase = new ValidatePdfStructureUseCase(validator, logger);

      await useCase.execute(Buffer.from(''), BancoConocido.BancoEstado);

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'validate-pdf-structure: structure validation outcome',
          context: { valido: false, problemasCount: 2 },
        },
      ]);
    });
  });
});
