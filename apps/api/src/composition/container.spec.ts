import type { PrismaClient } from '@prisma/client';
import { createContainer } from './container';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';

/**
 * createContainer — composition root real (ADR-028). Ensambla el grafo con
 * `new` y es dueño del ciclo de vida de Prisma que antes gestionaba Nest.
 *
 * En Slice 0 la única superficie es `shutdown()`: la prueba de que el container
 * —no el framework— cierra la conexión. La interfaz crece un use case por slice.
 */
describe('createContainer', () => {
  it('shutdown() cierra la conexión Prisma', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const fakePrisma = { $disconnect: disconnect } as unknown as PrismaClient;

    const container = createContainer(fakePrisma);
    await container.shutdown();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('ensambla ValidarSesionUseCase (usado por el session middleware)', () => {
    const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;

    const container = createContainer(fakePrisma);

    expect(container.validarSesion).toBeInstanceOf(ValidarSesionUseCase);
  });
});
