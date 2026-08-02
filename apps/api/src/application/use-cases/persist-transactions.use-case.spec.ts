import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import {
  CrearIngestaProcesadaInput,
  IIngestaRepository,
} from '../ports/ingesta-repository.port';

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
    const useCase = new PersistTransactionsUseCase(repo);

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
    const useCase = new PersistTransactionsUseCase(repo);

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
    const useCase = new PersistTransactionsUseCase(repo);

    const result = await useCase.execute({ ...baseInput, transacciones: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().total).toBe(0);
  });

  it('persistirProcesada falla: propaga la MISMA instancia de error, sin envolverla', async () => {
    const repo = new FakeIngestaRepository();
    const error = new PersistenciaFallidaError('base de datos no disponible');
    repo.failWith = error;
    const useCase = new PersistTransactionsUseCase(repo);

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('duplicadosOmitidos: 0 (sin duplicados) se ecoa igual', async () => {
    const repo = new FakeIngestaRepository();
    const useCase = new PersistTransactionsUseCase(repo);

    const result = await useCase.execute({
      ...baseInput,
      transacciones: TXS,
      duplicadosOmitidos: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().duplicadosOmitidos).toBe(0);
  });
});
