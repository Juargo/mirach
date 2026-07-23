import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';

function makeNormalizer(
  impl: (
    buffer: Buffer,
    banco: BancoConocido,
  ) => Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>>,
): ITransactionNormalizer {
  return { normalize: impl };
}

describe('NormalizeTransactionsUseCase', () => {
  it('delega en el port y retorna las transacciones normalizadas', async () => {
    const transacciones: Transaccion[] = [
      Transaccion.crear({ fecha: new Date('2026-05-14'), descripcion: 'Compra', cargo: 8103, abono: 0 }).getValue(),
      Transaccion.crear({ fecha: new Date('2026-05-15'), descripcion: 'Sueldo', cargo: 0, abono: 1500000 }).getValue(),
    ];
    const normalizer = makeNormalizer(async () => Result.ok(transacciones));
    const useCase = new NormalizeTransactionsUseCase(normalizer);

    const result = await useCase.execute(Buffer.from(''), BancoConocido.BancoEstado);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(transacciones);
  });

  it('propaga el error cuando la normalización falla', async () => {
    const error = new NormalizacionInvalidaError(BancoConocido.Santander, [
      { tipo: 'FilaSinMontos', fila: 5 },
    ]);
    const normalizer = makeNormalizer(async () => Result.fail(error));
    const useCase = new NormalizeTransactionsUseCase(normalizer);

    const result = await useCase.execute(Buffer.from(''), BancoConocido.Santander);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('pasa el banco y el buffer al normalizer', async () => {
    const calls: Array<{ buffer: Buffer; banco: BancoConocido }> = [];
    const normalizer = makeNormalizer(async (buffer, banco) => {
      calls.push({ buffer, banco });
      return Result.ok([]);
    });
    const useCase = new NormalizeTransactionsUseCase(normalizer);
    const buf = Buffer.from('abc');

    await useCase.execute(buf, BancoConocido.BCI);

    expect(calls).toHaveLength(1);
    expect(calls[0].buffer).toBe(buf);
    expect(calls[0].banco).toBe(BancoConocido.BCI);
  });
});
