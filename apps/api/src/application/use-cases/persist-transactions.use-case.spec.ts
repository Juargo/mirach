import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import {
  CrearIngestaProcesadaInput,
  IIngestaRepository,
} from '../ports/ingesta-repository.port';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

/**
 * Fake in-memory que implementa el port COLAPSADO (US-004, design.md §6.3/
 * §6.4): una única `persistirProcesada` reemplaza
 * `createPending`/`commit`/`markFailed`. `PersistTransactionsUseCase` es
 * ahora un pass-through puro — su único trabajo es ecoar
 * `duplicadosOmitidos` del input (persistirProcesada solo retorna
 * {ingestaId,total}).
 */
class FakeIngestaRepository implements IIngestaRepository {
  failWith?: PersistenciaFallidaError;
  readonly calls: CrearIngestaProcesadaInput[] = [];

  async persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<
    Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>
  > {
    this.calls.push(input);
    if (this.failWith) {
      return Result.fail(this.failWith);
    }
    return Result.ok({
      ingestaId: 'ingesta-1',
      total: input.transacciones.length,
    });
  }
}

const TXS: Transaccion[] = [
  Transaccion.crear({
    fecha: new Date('2026-05-14T00:00:00.000Z'),
    descripcion: 'Compra',
    cargo: 8103n,
    abono: 0n,
  }).getValue(),
  Transaccion.crear({
    fecha: new Date('2026-05-15T00:00:00.000Z'),
    descripcion: 'Sueldo',
    cargo: 0n,
    abono: 1500000n,
  }).getValue(),
];

const baseInput = {
  userId: 'user-1',
  accountId: 'acc-1',
  banco: 'BancoEstado',
  nombreArchivo: 'movimientos.xlsx',
  duplicadosOmitidos: 0,
};

describe('PersistTransactionsUseCase (US-004 — persist-path collapse)', () => {
  it('happy path: delega a persistirProcesada y retorna ok({ingestaId,total,duplicadosOmitidos})', async () => {
    const repo = new FakeIngestaRepository();
    const useCase = new PersistTransactionsUseCase(repo, new NoOpLogger());

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      ingestaId: 'ingesta-1',
      total: 2,
      duplicadosOmitidos: 0,
    });
  });

  it('pasa TODOS los campos (incl. userId) a persistirProcesada, sin transformarlos', async () => {
    const repo = new FakeIngestaRepository();
    const useCase = new PersistTransactionsUseCase(repo, new NoOpLogger());

    await useCase.execute({
      ...baseInput,
      transacciones: TXS,
      duplicadosOmitidos: 3,
    });

    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0]).toEqual({
      userId: 'user-1',
      accountId: 'acc-1',
      banco: 'BancoEstado',
      nombreArchivo: 'movimientos.xlsx',
      transacciones: TXS,
      duplicadosOmitidos: 3,
    });
  });

  it('lista vacía: delega igual y retorna ok({total:0})', async () => {
    const repo = new FakeIngestaRepository();
    const useCase = new PersistTransactionsUseCase(repo, new NoOpLogger());

    const result = await useCase.execute({ ...baseInput, transacciones: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().total).toBe(0);
  });

  it('persistirProcesada falla: propaga la MISMA instancia de error, sin envolverla', async () => {
    const repo = new FakeIngestaRepository();
    const error = new PersistenciaFallidaError('base de datos no disponible');
    repo.failWith = error;
    const useCase = new PersistTransactionsUseCase(repo, new NoOpLogger());

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('duplicadosOmitidos: 0 (sin duplicados) se ecoa igual', async () => {
    const repo = new FakeIngestaRepository();
    const useCase = new PersistTransactionsUseCase(repo, new NoOpLogger());

    const result = await useCase.execute({
      ...baseInput,
      transacciones: TXS,
      duplicadosOmitidos: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().duplicadosOmitidos).toBe(0);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea ingestaId/total/duplicadosOmitidos, nunca nombreArchivo/descripción/montos', async () => {
      const repo = new FakeIngestaRepository();
      const logger = new FakeLogger();
      const useCase = new PersistTransactionsUseCase(repo, logger);

      const result = await useCase.execute({
        ...baseInput,
        transacciones: TXS,
        duplicadosOmitidos: 1,
      });

      expect(result.isOk()).toBe(true);
      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'persist-transactions: persisted',
          context: {
            persistido: true,
            ingestaId: 'ingesta-1',
            accountId: 'acc-1',
            total: 2,
            duplicadosOmitidos: 1,
          },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('movimientos.xlsx');
      expect(serializedContexts).not.toContain('Compra');
      expect(serializedContexts).not.toContain('Sueldo');
      expect(serializedContexts).not.toContain('8103');
      expect(serializedContexts).not.toContain('1500000');
    });

    it('en fallo loguea persistido:false sin exponer el motivo crudo del repositorio', async () => {
      const repo = new FakeIngestaRepository();
      const error = new PersistenciaFallidaError('base de datos no disponible');
      repo.failWith = error;
      const logger = new FakeLogger();
      const useCase = new PersistTransactionsUseCase(repo, logger);

      await useCase.execute({ ...baseInput, transacciones: TXS });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'persist-transactions: persist failed',
          context: { persistido: false, accountId: 'acc-1' },
        },
      ]);
    });
  });
});
