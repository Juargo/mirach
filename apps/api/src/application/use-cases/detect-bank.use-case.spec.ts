import type { Mock } from 'vitest';
import { DetectBankUseCase } from './detect-bank.use-case';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

describe('DetectBankUseCase', () => {
  it('delega en el IBankDetector inyectado y retorna su resultado', async () => {
    const detected: DetectedBank = {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: '12345678',
    };
    const detector: IBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.ok(detected)),
    };
    const useCase = new DetectBankUseCase(detector, new NoOpLogger());
    const buffer = Buffer.from('contenido');

    const result = await useCase.execute(buffer, 'movimientos.xlsx');

    expect(detector.detect as Mock).toHaveBeenCalledWith(
      buffer,
      'movimientos.xlsx',
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(detected);
  });

  it('propaga el Result.fail del detector sin modificarlo', async () => {
    const error = new BancoNoReconocidoError('movimientos.xlsx');
    const detector: IBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = new DetectBankUseCase(detector, new NoOpLogger());

    const result = await useCase.execute(Buffer.from(''), 'movimientos.xlsx');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea el banco detectado en el happy path', async () => {
      const detected: DetectedBank = {
        banco: BancoConocido.BCI,
        tipoCuenta: TipoCuentaConocido.CuentaCorriente,
        numeroCuenta: '12345678',
      };
      const detector: IBankDetector = {
        detect: vi.fn().mockResolvedValue(Result.ok(detected)),
      };
      const logger = new FakeLogger();
      const useCase = new DetectBankUseCase(detector, logger);

      await useCase.execute(
        Buffer.from('contenido'),
        'movimientos-reales.xlsx',
      );

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'detect-bank: bank detection outcome',
          context: { detected: true, banco: BancoConocido.BCI },
        },
      ]);
    });

    it('NUNCA incluye el nombre de archivo original en el context logueado', async () => {
      const error = new BancoNoReconocidoError('secreto-usuario.xlsx');
      const detector: IBankDetector = {
        detect: vi.fn().mockResolvedValue(Result.fail(error)),
      };
      const logger = new FakeLogger();
      const useCase = new DetectBankUseCase(detector, logger);

      await useCase.execute(Buffer.from(''), 'secreto-usuario.xlsx');

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'detect-bank: bank detection outcome',
          context: { detected: false, banco: null },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('secreto-usuario');
    });
  });
});
