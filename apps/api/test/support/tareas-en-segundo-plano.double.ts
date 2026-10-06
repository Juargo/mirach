import type { ITareasEnSegundoPlano } from '../../src/application/ports/tareas-en-segundo-plano.port';

/**
 * TareasSincronas — doble de `ITareasEnSegundoPlano`: arranca la tarea en el
 * acto y deja que el test espere su término con `esperar()`.
 */
export class TareasSincronas implements ITareasEnSegundoPlano {
  private readonly pendientes: Promise<void>[] = [];

  programar(tarea: () => Promise<void>): void {
    this.pendientes.push(tarea());
  }

  async esperar(): Promise<void> {
    await Promise.all(this.pendientes);
  }
}
