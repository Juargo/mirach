import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

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
      Transaccion.crear({
        fecha: new Date('2026-05-14'),
        descripcion: 'Compra',
        cargo: 8103n,
        abono: 0n,
      }).getValue(),
      Transaccion.crear({
        fecha: new Date('2026-05-15'),
        descripcion: 'Sueldo',
        cargo: 0n,
        abono: 1500000n,
      }).getValue(),
    ];
    const normalizer = makeNormalizer(async () => Result.ok(transacciones));
    const useCase = new NormalizeTransactionsUseCase(
      normalizer,
      new NoOpLogger(),
    );

    const result = await useCase.execute(
      Buffer.from(''),
      BancoConocido.BancoEstado,
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(transacciones);
  });

  it('propaga el error cuando la normalización falla', async () => {
    const error = new NormalizacionInvalidaError(BancoConocido.Santander, [
      { tipo: 'FilaSinMontos', fila: 5 },
    ]);
    const normalizer = makeNormalizer(async () => Result.fail(error));
    const useCase = new NormalizeTransactionsUseCase(
      normalizer,
      new NoOpLogger(),
    );

    const result = await useCase.execute(
      Buffer.from(''),
      BancoConocido.Santander,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('pasa el banco y el buffer al normalizer', async () => {
    const calls: Array<{ buffer: Buffer; banco: BancoConocido }> = [];
    const normalizer = makeNormalizer(async (buffer, banco) => {
      calls.push({ buffer, banco });
      return Result.ok([]);
    });
    const useCase = new NormalizeTransactionsUseCase(
      normalizer,
      new NoOpLogger(),
    );
    const buf = Buffer.from('abc');

    await useCase.execute(buf, BancoConocido.BCI);

    expect(calls).toHaveLength(1);
    expect(calls[0].buffer).toBe(buf);
    expect(calls[0].banco).toBe(BancoConocido.BCI);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea solo el CONTEO de filas normalizadas, nunca descripción/montos', async () => {
      const transacciones: Transaccion[] = [
        Transaccion.crear({
          fecha: new Date('2026-05-14'),
          descripcion: 'Compra en supermercado secreto',
          cargo: 8103n,
          abono: 0n,
        }).getValue(),
        Transaccion.crear({
          fecha: new Date('2026-05-15'),
          descripcion: 'Sueldo empleador secreto',
          cargo: 0n,
          abono: 1500000n,
        }).getValue(),
      ];
      const normalizer = makeNormalizer(async () => Result.ok(transacciones));
      const logger = new FakeLogger();
      const useCase = new NormalizeTransactionsUseCase(normalizer, logger);

      await useCase.execute(Buffer.from(''), BancoConocido.BancoEstado);

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'normalize-transactions: rows normalized',
          context: { normalizado: true, filas: 2 },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('secreto');
      expect(serializedContexts).not.toContain('8103');
      expect(serializedContexts).not.toContain('1500000');
    });
  });
});
