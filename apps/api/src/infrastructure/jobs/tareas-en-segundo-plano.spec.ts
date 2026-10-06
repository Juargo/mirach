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

describe('TareasEnSegundoPlano.drenar (apagado ordenado)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin tareas en curso resuelve de inmediato y no avisa', async () => {
    const logger = new FakeLogger();

    await new TareasEnSegundoPlano(logger).drenar(1000);

    expect(logger.calls).toEqual([]);
  });

  it('espera a una tarea pendiente (incluso una que aún no arrancó) antes de resolver', async () => {
    const logger = new FakeLogger();
    const tareas = new TareasEnSegundoPlano(logger);
    let terminar!: () => void;
    let terminada = false;
    tareas.programar(
      () =>
        new Promise<void>((resolve) => {
          terminar = () => {
            terminada = true;
            resolve();
          };
        }),
    );

    let drenado = false;
    const drenar = tareas.drenar(5000).then(() => {
      drenado = true;
    });
    await siguienteTurno();
    await siguienteTurno();
    expect(drenado).toBe(false);

    terminar();
    await drenar;

    expect(terminada).toBe(true);
    expect(logger.calls).toEqual([]);
  });

  it('al vencer el plazo resuelve y avisa con la cantidad de tareas abandonadas (sin secretos)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const logger = new FakeLogger();
    const tareas = new TareasEnSegundoPlano(logger);
    tareas.programar(() => new Promise<void>(() => {}));
    tareas.programar(() => new Promise<void>(() => {}));
    await siguienteTurno();

    const drenar = tareas.drenar(8000);
    await vi.advanceTimersByTimeAsync(8000);
    await drenar;

    const warn = logger.calls.find((c) => c.level === 'warn');
    expect(warn?.context).toEqual({ abandonadas: 2 });
  });

  it('una tarea que rechaza no escapa del drenado ni cuenta como abandonada', async () => {
    const logger = new FakeLogger();
    const tareas = new TareasEnSegundoPlano(logger);
    tareas.programar(async () => {
      throw new Error('boom');
    });

    await expect(tareas.drenar(1000)).resolves.toBeUndefined();

    expect(logger.calls.some((c) => c.level === 'warn')).toBe(false);
  });
});
