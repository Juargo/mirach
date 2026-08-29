import { EliminarMovimientoManualUseCase } from './eliminar-movimiento-manual.use-case';
import { IEliminarMovimientoManualWriter } from '../ports/eliminar-movimiento-manual.port';
import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { MovimientoDemoSoloLecturaError } from '../../domain/errors/movimiento-demo-solo-lectura.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

function makeWriter(
  result: Result<void, TransaccionNoEncontradaError>,
): IEliminarMovimientoManualWriter {
  return {
    eliminarManual: vi.fn().mockResolvedValue(result),
  };
}

describe('EliminarMovimientoManualUseCase', () => {
  it('DEL-03: el demo gate corta ANTES de llamar al writer', async () => {
    const writer = makeWriter(Result.ok(undefined));
    const useCase = new EliminarMovimientoManualUseCase(
      writer,
      new NoOpLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      transaccionId: 'tx-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MovimientoDemoSoloLecturaError);
    expect(writer.eliminarManual).not.toHaveBeenCalled();
  });

  it('DEL-01: delega en el writer con userId + transaccionId y propaga Result.ok', async () => {
    const writer = makeWriter(Result.ok(undefined));
    const useCase = new EliminarMovimientoManualUseCase(
      writer,
      new NoOpLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-a',
      esDemo: false,
      transaccionId: 'tx-1',
    });

    expect(result.isOk()).toBe(true);
    expect(writer.eliminarManual).toHaveBeenCalledWith('user-a', 'tx-1');
  });

  it('DEL-02: propaga el TransaccionNoEncontradaError del writer (not-found, not-owned, o not-manual — indistinguibles)', async () => {
    const writer = makeWriter(
      Result.fail(new TransaccionNoEncontradaError('tx-ajena')),
    );
    const useCase = new EliminarMovimientoManualUseCase(
      writer,
      new NoOpLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-a',
      esDemo: false,
      transaccionId: 'tx-ajena',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
  });

  describe('debug logging (ADR-033 — redaction contract, ADR-013)', () => {
    it('loguea transaccionId + outcome, nunca el userId ni montos', async () => {
      const writer = makeWriter(Result.ok(undefined));
      const logger = new FakeLogger();
      const useCase = new EliminarMovimientoManualUseCase(writer, logger);

      await useCase.execute({
        userId: 'user-secreto',
        esDemo: false,
        transaccionId: 'tx-1',
      });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'eliminar-movimiento-manual: delete outcome',
          context: { transaccionId: 'tx-1', eliminado: true },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('user-secreto');
    });
  });
});
