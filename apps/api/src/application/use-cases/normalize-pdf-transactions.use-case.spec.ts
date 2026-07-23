import type { Mock } from 'vitest';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { IPdfTransactionNormalizer } from '../ports/pdf-transaction-normalizer.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';

describe('NormalizePdfTransactionsUseCase', () => {
  it('delega al port y retorna su Result.ok tal cual', async () => {
    const transacciones: ReadonlyArray<Transaccion> = [
      Transaccion.crear({
        fecha: new Date(Date.UTC(2026, 2, 5)),
        descripcion: 'x',
        cargo: 0n,
        abono: 1000n,
      }).getValue(),
    ];
    const normalizer: IPdfTransactionNormalizer = {
      normalize: vi.fn().mockResolvedValue(Result.ok(transacciones)),
    };
    const useCase = new NormalizePdfTransactionsUseCase(normalizer);
    const buffer = Buffer.from('pdf');

    const result = await useCase.execute(buffer, BancoConocido.Santander);

    expect(normalizer.normalize as Mock).toHaveBeenCalledWith(
      buffer,
      BancoConocido.Santander,
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(transacciones);
  });

  it('delega al port y retorna su Result.fail tal cual', async () => {
    const error = new RangoFechasInvalidoError(BancoConocido.Santander);
    const normalizer: IPdfTransactionNormalizer = {
      normalize: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const useCase = new NormalizePdfTransactionsUseCase(normalizer);

    const result = await useCase.execute(
      Buffer.from('pdf'),
      BancoConocido.Santander,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });
});
