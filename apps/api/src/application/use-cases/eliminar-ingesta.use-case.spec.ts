import { EliminarIngestaUseCase } from './eliminar-ingesta.use-case';
import { IEliminarIngestaWriter } from '../ports/eliminar-ingesta.port';
import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';
import { IngestaDemoSoloLecturaError } from '../../domain/errors/ingesta-demo-solo-lectura.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

function makeWriter(
  result: Result<void, IngestaNoEncontradaError>,
): IEliminarIngestaWriter {
  return {
    eliminarConTransacciones: vi.fn().mockResolvedValue(result),
  };
}

describe('EliminarIngestaUseCase', () => {
  it('issue #500: el demo gate corta ANTES de llamar al writer', async () => {
    const writer = makeWriter(Result.ok(undefined));
    const useCase = new EliminarIngestaUseCase(writer, new NoOpLogger());

    const result = await useCase.execute({
      userId: 'user-demo',
      esDemo: true,
      ingestaId: 'ing-1',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaDemoSoloLecturaError);
    expect(writer.eliminarConTransacciones).not.toHaveBeenCalled();
  });

  it('T1.4a: delega en el writer con userId + ingestaId y propaga Result.ok', async () => {
    const writer = makeWriter(Result.ok(undefined));
    const useCase = new EliminarIngestaUseCase(writer, new NoOpLogger());

    const result = await useCase.execute({
      userId: 'user-a',
      esDemo: false,
      ingestaId: 'ing-1',
    });

    expect(result.isOk()).toBe(true);
    expect(writer.eliminarConTransacciones).toHaveBeenCalledWith(
      'user-a',
      'ing-1',
    );
  });

  it('T1.4b: propaga el IngestaNoEncontradaError del writer (not-found o not-owned, indistinguible)', async () => {
    const writer = makeWriter(
      Result.fail(new IngestaNoEncontradaError('ing-ajena')),
    );
    const useCase = new EliminarIngestaUseCase(writer, new NoOpLogger());

    const result = await useCase.execute({
      userId: 'user-a',
      esDemo: false,
      ingestaId: 'ing-ajena',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaNoEncontradaError);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea ingestaId + outcome, nunca el userId', async () => {
      const writer = makeWriter(Result.ok(undefined));
      const logger = new FakeLogger();
      const useCase = new EliminarIngestaUseCase(writer, logger);

      await useCase.execute({
        userId: 'user-secreto',
        esDemo: false,
        ingestaId: 'ing-1',
      });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'eliminar-ingesta: delete outcome',
          context: { ingestaId: 'ing-1', eliminado: true },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('user-secreto');
    });
  });
});
