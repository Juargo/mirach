import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import {
  CrearIngestaInput,
  IIngestaRepository,
} from '../ports/ingesta-repository.port';
import { ITransaccionRepository } from '../ports/transaccion-repository.port';

/**
 * Estados del ciclo de vida de la Ingesta, modelados con literales de string
 * (mismos valores que el enum Prisma EstadoIngesta). El estado vive en la
 * infraestructura; la capa de aplicación no depende del cliente generado, por
 * eso el fake lo modela localmente.
 */
type EstadoIngesta = 'PENDIENTE' | 'PROCESADA' | 'FALLIDA';

interface IngestaRecord {
  id: string;
  accountId: string;
  banco: string;
  nombreArchivo: string;
  estado: EstadoIngesta;
  totalTransacciones: number | null;
  motivoFallo: string | null;
  procesadoEn: Date | null;
}

interface FilaPersistida extends Transaccion {
  ingestaId: string;
  accountId: string;
}

/**
 * Fake in-memory que implementa AMBOS ports (escritura + lectura). Simula la
 * atomicidad: si `failCommitWith` está configurado, `commit` no persiste nada
 * (rollback) y devuelve Result.fail.
 */
class FakeIngestaStore implements IIngestaRepository, ITransaccionRepository {
  private seq = 0;
  readonly ingestas = new Map<string, IngestaRecord>();
  private readonly filas: FilaPersistida[] = [];

  failCreatePendingWith?: PersistenciaFallidaError;
  failCommitWith?: PersistenciaFallidaError;
  /** Cuando está seteado, markFailed devuelve Result.fail (fallo controlado). */
  failMarkFailedWith?: PersistenciaFallidaError;
  /** Cuando está seteado, markFailed RECHAZA (simula DB caída que lanza). */
  throwOnMarkFailed?: Error;

  readonly markFailedCalls: Array<{ ingestaId: string; motivo: string }> = [];
  readonly calls: string[] = [];
  commitCalls = 0;

  async createPending(
    input: CrearIngestaInput,
  ): Promise<Result<{ ingestaId: string }, PersistenciaFallidaError>> {
    this.calls.push('createPending');
    if (this.failCreatePendingWith) {
      return Result.fail(this.failCreatePendingWith);
    }
    const id = `ingesta-${++this.seq}`;
    this.ingestas.set(id, {
      id,
      accountId: input.accountId,
      banco: input.banco,
      nombreArchivo: input.nombreArchivo,
      estado: 'PENDIENTE',
      totalTransacciones: null,
      motivoFallo: null,
      procesadoEn: null,
    });
    return Result.ok({ ingestaId: id });
  }

  async commit(
    ingestaId: string,
    accountId: string,
    transacciones: ReadonlyArray<Transaccion>,
  ): Promise<Result<{ total: number }, PersistenciaFallidaError>> {
    this.calls.push('commit');
    this.commitCalls++;
    if (this.failCommitWith) {
      // Atómico: nada se persiste; el estado NO se toca aquí (lo hace markFailed).
      return Result.fail(this.failCommitWith);
    }
    for (const tx of transacciones) {
      this.filas.push({ ...tx, ingestaId, accountId });
    }
    const rec = this.ingestas.get(ingestaId);
    if (rec) {
      rec.estado = 'PROCESADA';
      rec.totalTransacciones = transacciones.length;
      rec.procesadoEn = new Date();
    }
    return Result.ok({ total: transacciones.length });
  }

  async markFailed(
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    this.calls.push('markFailed');
    this.markFailedCalls.push({ ingestaId, motivo });
    if (this.throwOnMarkFailed) {
      // DB caída: ni siquiera podemos marcar FALLIDA — la fila queda PENDIENTE.
      throw this.throwOnMarkFailed;
    }
    const rec = this.ingestas.get(ingestaId);
    if (rec) {
      rec.estado = 'FALLIDA';
      rec.motivoFallo = motivo;
    }
    if (this.failMarkFailedWith) {
      return Result.fail(this.failMarkFailedWith);
    }
    return Result.ok(undefined);
  }

  async findByIngesta(ingestaId: string): Promise<ReadonlyArray<Transaccion>> {
    return this.filas
      .filter((f) => f.ingestaId === ingestaId)
      .map(({ fecha, descripcion, cargo, abono }) => ({
        fecha,
        descripcion,
        cargo,
        abono,
      }));
  }

  filasFor(ingestaId: string): FilaPersistida[] {
    return this.filas.filter((f) => f.ingestaId === ingestaId);
  }
}

const TXS: Transaccion[] = [
  { fecha: new Date('2026-05-14T00:00:00.000Z'), descripcion: 'Compra', cargo: 8103, abono: 0 },
  { fecha: new Date('2026-05-15T00:00:00.000Z'), descripcion: 'Sueldo', cargo: 0, abono: 1500000 },
];

const baseInput = {
  accountId: 'acc-1',
  banco: 'BancoEstado',
  nombreArchivo: 'movimientos.xlsx',
};

describe('PersistTransactionsUseCase', () => {
  it('happy path: persiste N transacciones bajo una Ingesta PROCESADA y retorna ok({ingestaId,total})', async () => {
    const store = new FakeIngestaStore();
    const useCase = new PersistTransactionsUseCase(store);

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isOk()).toBe(true);
    const { ingestaId, total } = result.getValue();
    expect(total).toBe(2);

    // Ingesta transiciona a PROCESADA con total y timestamp.
    const ingesta = store.ingestas.get(ingestaId);
    expect(ingesta?.estado).toBe('PROCESADA');
    expect(ingesta?.totalTransacciones).toBe(2);
    expect(ingesta?.procesadoEn).toBeInstanceOf(Date);

    // Las N filas quedan con FK ingestaId + accountId.
    const filas = store.filasFor(ingestaId);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.ingestaId === ingestaId)).toBe(true);
    expect(filas.every((f) => f.accountId === 'acc-1')).toBe(true);

    // Lectura de vuelta devuelve las transacciones de dominio.
    const leidas = await store.findByIngesta(ingestaId);
    expect(leidas).toEqual(TXS);

    // No hubo marcado de fallo.
    expect(store.markFailedCalls).toHaveLength(0);
  });

  it('lista vacía: persiste Ingesta con total 0 y retorna ok({total:0})', async () => {
    const store = new FakeIngestaStore();
    const useCase = new PersistTransactionsUseCase(store);

    const result = await useCase.execute({ ...baseInput, transacciones: [] });

    expect(result.isOk()).toBe(true);
    const { ingestaId, total } = result.getValue();
    expect(total).toBe(0);

    const ingesta = store.ingestas.get(ingestaId);
    expect(ingesta?.estado).toBe('PROCESADA');
    expect(ingesta?.totalTransacciones).toBe(0);
    expect(store.filasFor(ingestaId)).toHaveLength(0);
    expect(store.commitCalls).toBe(1); // commit se llama igual para transicionar a PROCESADA
  });

  it('fallo atómico en commit: marca la Ingesta FALLIDA, no deja filas y retorna fail', async () => {
    const store = new FakeIngestaStore();
    const error = new PersistenciaFallidaError('base de datos no disponible');
    store.failCommitWith = error;
    const useCase = new PersistTransactionsUseCase(store);

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error); // propaga la MISMA instancia

    // La Ingesta existe pero quedó FALLIDA con motivo; cero filas persistidas.
    expect(store.markFailedCalls).toHaveLength(1);
    const { ingestaId, motivo } = store.markFailedCalls[0];
    expect(motivo).toBe('base de datos no disponible');
    const ingesta = store.ingestas.get(ingestaId);
    expect(ingesta?.estado).toBe('FALLIDA');
    expect(ingesta?.motivoFallo).toBe('base de datos no disponible');
    expect(store.filasFor(ingestaId)).toHaveLength(0);
  });

  it('fallo al crear la Ingesta PENDIENTE: retorna fail y no intenta commit ni markFailed', async () => {
    const store = new FakeIngestaStore();
    const error = new PersistenciaFallidaError('no se pudo crear la ingesta');
    store.failCreatePendingWith = error;
    const useCase = new PersistTransactionsUseCase(store);

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(store.commitCalls).toBe(0);
    expect(store.markFailedCalls).toHaveLength(0);
  });

  it('markFailed RECHAZA (DB caída): execute NO lanza, resuelve al error ORIGINAL del commit', async () => {
    const store = new FakeIngestaStore();
    const commitError = new PersistenciaFallidaError('base de datos no disponible');
    store.failCommitWith = commitError;
    store.throwOnMarkFailed = new Error('connection refused durante markFailed');
    const useCase = new PersistTransactionsUseCase(store);

    // No debe rechazar aunque markFailed lance.
    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(commitError); // el error ORIGINAL, no el de markFailed
    expect(store.markFailedCalls).toHaveLength(1);
    // markFailed no pudo completar → la Ingesta quedó PENDIENTE (no hay filas).
    const ingestaId = store.markFailedCalls[0].ingestaId;
    expect(store.ingestas.get(ingestaId)?.estado).toBe('PENDIENTE');
    expect(store.filasFor(ingestaId)).toHaveLength(0);
  });

  it('markFailed devuelve Result.fail: execute NO lanza, resuelve al error ORIGINAL del commit', async () => {
    const store = new FakeIngestaStore();
    const commitError = new PersistenciaFallidaError('rollback');
    store.failCommitWith = commitError;
    store.failMarkFailedWith = new PersistenciaFallidaError('markFailed también falló');
    const useCase = new PersistTransactionsUseCase(store);

    const result = await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(commitError);
    expect(store.markFailedCalls).toHaveLength(1);
  });

  it('respeta el orden del ciclo de vida: createPending ANTES de commit', async () => {
    const store = new FakeIngestaStore();
    const useCase = new PersistTransactionsUseCase(store);

    await useCase.execute({ ...baseInput, transacciones: TXS });

    expect(store.calls).toEqual(['createPending', 'commit']);
  });
});
