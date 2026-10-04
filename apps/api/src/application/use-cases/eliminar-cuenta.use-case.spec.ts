import { EliminarCuentaUseCase } from './eliminar-cuenta.use-case';
import { ConfirmacionEliminacionInvalidaError } from '../../domain/errors/confirmacion-eliminacion-invalida.error';
import type { ICuentaRepository } from '../ports/cuenta-repository.port';
import type { IRevocadorIdentidadExterna } from '../ports/revocador-identidad-externa.port';
import { FakeLogger } from '../../../test/support/logger.double';

function build(opts: { revocarFalla?: boolean } = {}) {
  const orden: string[] = [];
  const cuentas: ICuentaRepository = {
    eliminar: vi.fn().mockImplementation(async () => {
      orden.push('eliminar');
    }),
  };
  const revocador: IRevocadorIdentidadExterna = {
    revocar: vi.fn().mockImplementation(async () => {
      orden.push('revocar');
      if (opts.revocarFalla) throw new Error('apple down token=SECRETO');
    }),
  };
  const logger = new FakeLogger();
  const useCase = new EliminarCuentaUseCase(cuentas, revocador, logger);
  return { useCase, cuentas, revocador, logger, orden };
}

describe('EliminarCuentaUseCase', () => {
  it.each([[undefined], [''], ['eliminar'], ['ELIMINAR '], ['SI']])(
    'confirmación %p → error y NO toca el repositorio ni el revocador',
    async (confirmacion) => {
      const { useCase, cuentas, revocador } = build();

      const result = await useCase.execute({ userId: 'u1', confirmacion });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(
        ConfirmacionEliminacionInvalidaError,
      );
      expect(cuentas.eliminar).not.toHaveBeenCalled();
      expect(revocador.revocar).not.toHaveBeenCalled();
    },
  );

  it('éxito: elimina la cuenta del usuario de la sesión', async () => {
    const { useCase, cuentas } = build();

    const result = await useCase.execute({
      userId: 'u1',
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(cuentas.eliminar).toHaveBeenCalledExactlyOnceWith('u1');
  });

  it('revoca la identidad externa ANTES de borrar (los datos viven en las filas)', async () => {
    const { useCase, revocador, orden } = build();

    await useCase.execute({ userId: 'u1', confirmacion: 'ELIMINAR' });

    expect(revocador.revocar).toHaveBeenCalledExactlyOnceWith('u1');
    expect(orden).toEqual(['revocar', 'eliminar']);
  });

  it('si la revocación falla igual elimina, y loguea un warn sin el mensaje del error', async () => {
    const { useCase, cuentas, logger } = build({ revocarFalla: true });

    const result = await useCase.execute({
      userId: 'u1',
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(cuentas.eliminar).toHaveBeenCalledWith('u1');
    const warn = logger.calls.find((c) => c.level === 'warn');
    expect(warn).toBeDefined();
    expect(JSON.stringify(warn)).not.toContain('SECRETO');
  });

  it('loguea una línea de auditoría info solo con el userId', async () => {
    const { useCase, logger } = build();

    await useCase.execute({ userId: 'u1', confirmacion: 'ELIMINAR' });

    const infos = logger.calls.filter((c) => c.level === 'info');
    expect(infos).toHaveLength(1);
    expect(infos[0].context).toEqual({ userId: 'u1' });
  });

  it('si el repositorio lanza (BD caída) propaga la excepción y no loguea auditoría', async () => {
    const { useCase, cuentas, logger } = build();
    vi.mocked(cuentas.eliminar).mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute({ userId: 'u1', confirmacion: 'ELIMINAR' }),
    ).rejects.toThrow('db down');
    expect(logger.calls.some((c) => c.level === 'info')).toBe(false);
  });
});
