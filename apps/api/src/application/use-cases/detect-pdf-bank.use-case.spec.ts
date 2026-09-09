import type { Mock } from 'vitest';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import {
  IPdfBankDetector,
  DetectedBank,
} from '../ports/pdf-bank-detector.port';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

describe('DetectPdfBankUseCase', () => {
  it('delega en el IPdfBankDetector inyectado y retorna su resultado', async () => {
    const detected: DetectedBank = {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: '12345678',
    };
    const detector: IPdfBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.ok(detected)),
    };
    const useCase = new DetectPdfBankUseCase(detector, new NoOpLogger());
    const buffer = Buffer.from('contenido');

    const result = await useCase.execute(buffer, 'cartola.pdf');

    // password no fue provisto → se forwarda `undefined` (D-01: trailing
    // optional, sin efecto para el detector cuando está ausente).
    expect(detector.detect as Mock).toHaveBeenCalledWith(
      buffer,
      'cartola.pdf',
      undefined,
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(detected);
  });

  it('propaga el Result.fail del detector sin modificarlo', async () => {
    const error = new BancoNoReconocidoError('cartola.pdf');
    const detector: IPdfBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = new DetectPdfBankUseCase(detector, new NoOpLogger());

    const result = await useCase.execute(Buffer.from(''), 'cartola.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('forwarda la password opcional al IPdfBankDetector inyectado (D-01)', async () => {
    const detected: DetectedBank = {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: '12345678',
    };
    const detector: IPdfBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.ok(detected)),
    };
    const useCase = new DetectPdfBankUseCase(detector, new NoOpLogger());
    const buffer = Buffer.from('contenido');

    await useCase.execute(buffer, 'cartola.pdf', 'la-clave');

    expect(detector.detect as Mock).toHaveBeenCalledWith(
      buffer,
      'cartola.pdf',
      'la-clave',
    );
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('NUNCA incluye el nombre de archivo original en el context logueado', async () => {
      const error = new BancoNoReconocidoError('secreto-usuario.pdf');
      const detector: IPdfBankDetector = {
        detect: vi.fn().mockResolvedValue(Result.fail(error)),
      };
      const logger = new FakeLogger();
      const useCase = new DetectPdfBankUseCase(detector, logger);

      await useCase.execute(Buffer.from(''), 'secreto-usuario.pdf');

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'detect-pdf-bank: bank detection outcome',
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
