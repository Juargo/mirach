import { TareasEnSegundoPlano } from './tareas-en-segundo-plano';
import { FakeLogger } from '../../../test/support/logger.double';

const siguienteTurno = () => new Promise((r) => setImmediate(r));

describe('TareasEnSegundoPlano', () => {
  it('programar retorna sin ejecutar la tarea; corre en el siguiente turno', async () => {
    const tarea = vi.fn().mockResolvedValue(undefined);

    new TareasEnSegundoPlano(new FakeLogger()).programar(tarea);

    expect(tarea).not.toHaveBeenCalled();
    await siguienteTurno();
    await siguienteTurno();
    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it('una tarea que rechaza se absorbe y se loguea solo con el nombre del error', async () => {
    const logger = new FakeLogger();
    const noManejadas: unknown[] = [];
    const handler = (e: unknown) => noManejadas.push(e);
    process.on('unhandledRejection', handler);

    new TareasEnSegundoPlano(logger).programar(async () => {
      throw new RangeError('token=SECRETO');
    });
    await siguienteTurno();
    await siguienteTurno();
    await siguienteTurno();
    process.off('unhandledRejection', handler);

    expect(noManejadas).toEqual([]);
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0].level).toBe('error');
    expect(logger.calls[0].context).toEqual({ errorName: 'RangeError' });
    expect(JSON.stringify(logger.calls)).not.toContain('SECRETO');
  });

  it('una tarea que lanza de forma síncrona tampoco escapa', async () => {
    const logger = new FakeLogger();

    new TareasEnSegundoPlano(logger).programar(() => {
      throw new TypeError('x');
    });
    await siguienteTurno();
    await siguienteTurno();

    expect(logger.calls[0].context).toEqual({ errorName: 'TypeError' });
  });
});
