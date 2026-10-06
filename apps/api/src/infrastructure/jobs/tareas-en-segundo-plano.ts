import type { ILogger } from '../../application/ports/logger.port';
import type { ITareasEnSegundoPlano } from '../../application/ports/tareas-en-segundo-plano.port';

/**
 * TareasEnSegundoPlano — `setImmediate` + captura total: la tarea corre tras
 * responder y cualquier rechazo o excepción síncrona se loguea (solo el
 * nombre del error, nunca el mensaje) en vez de volverse un unhandled
 * rejection que tumbaría el proceso.
 */
export class TareasEnSegundoPlano implements ITareasEnSegundoPlano {
  constructor(private readonly logger: ILogger) {}

  programar(tarea: () => Promise<void>): void {
    setImmediate(() => {
      void (async () => {
        try {
          await tarea();
        } catch (err) {
          this.logger.error('tarea en segundo plano fallida', {
            errorName: err instanceof Error ? err.name : 'UnknownError',
          });
        }
      })();
    });
  }
}
