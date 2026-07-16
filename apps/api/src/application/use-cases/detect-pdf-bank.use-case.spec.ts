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
    const useCase = new DetectPdfBankUseCase(detector);
    const buffer = Buffer.from('contenido');

    const result = await useCase.execute(buffer, 'cartola.pdf');

    expect(detector.detect as Mock).toHaveBeenCalledWith(
      buffer,
      'cartola.pdf',
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(detected);
  });

  it('propaga el Result.fail del detector sin modificarlo', async () => {
    const error = new BancoNoReconocidoError('cartola.pdf');
    const detector: IPdfBankDetector = {
      detect: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = new DetectPdfBankUseCase(detector);

    const result = await useCase.execute(Buffer.from(''), 'cartola.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });
});
