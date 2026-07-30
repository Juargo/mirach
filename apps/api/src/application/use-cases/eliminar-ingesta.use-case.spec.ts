import { EliminarIngestaUseCase } from './eliminar-ingesta.use-case';
import { IEliminarIngestaWriter } from '../ports/eliminar-ingesta.port';
import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';

function makeWriter(
  result: Result<void, IngestaNoEncontradaError>,
): IEliminarIngestaWriter {
  return {
    eliminarConTransacciones: vi.fn().mockResolvedValue(result),
  };
}

describe('EliminarIngestaUseCase', () => {
  it('T1.4a: delega en el writer con userId + ingestaId y propaga Result.ok', async () => {
    const writer = makeWriter(Result.ok(undefined));
    const useCase = new EliminarIngestaUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
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
    const useCase = new EliminarIngestaUseCase(writer);

    const result = await useCase.execute({
      userId: 'user-a',
      ingestaId: 'ing-ajena',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaNoEncontradaError);
  });
});
