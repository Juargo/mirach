import type { ILogger } from '../../application/ports/logger.port';
import type { ITareasEnSegundoPlano } from '../../application/ports/tareas-en-segundo-plano.port';

/**
 * TareasEnSegundoPlano — `setImmediate` + captura total: la tarea corre tras
 * responder y cualquier rechazo o excepción síncrona se loguea (solo el
 * nombre del error, nunca el mensaje) en vez de volverse un unhandled
 * rejection que tumbaría el proceso.
 *
 * Las tareas en curso (incluidas las programadas que aún no arrancaron) se
 * rastrean para poder `drenar` en el apagado ordenado: un SIGTERM a mitad de
 * un canje de Apple perdería el token en silencio (el code es de un solo uso).
 */
export class TareasEnSegundoPlano implements ITareasEnSegundoPlano {
  private readonly enCurso = new Set<Promise<void>>();

  constructor(private readonly logger: ILogger) {}

  programar(tarea: () => Promise<void>): void {
    const seguimiento = new Promise<void>((resolve) => {
      setImmediate(() => {
        void (async () => {
          try {
            await tarea();
          } catch (err) {
            this.logger.error('tarea en segundo plano fallida', {
              errorName: err instanceof Error ? err.name : 'UnknownError',
            });
          } finally {
            resolve();
          }
        })();
      });
    });

    this.enCurso.add(seguimiento);
    void seguimiento.then(() => this.enCurso.delete(seguimiento));
  }

  /**
   * Espera a las tareas en curso hasta `plazoMs`, incluidas las que se
   * programen DURANTE el drenado (un login servido en pleno apagado): no es un
   * snapshot, se repite mientras haya tareas y el plazo no venza. Nunca
   * rechaza. Solo avisa si el plazo realmente venció, con la cantidad que
   * quedaba en curso.
   */
  async drenar(plazoMs: number): Promise<void> {
    if (this.enCurso.size === 0) {
      return;
    }

    let vencido = false;
    let temporizador: NodeJS.Timeout | undefined;
    const plazo = new Promise<void>((resolve) => {
      temporizador = setTimeout(() => {
        vencido = true;
        resolve();
      }, plazoMs);
    });

    while (this.enCurso.size > 0 && !vencido) {
      await Promise.race([Promise.all([...this.enCurso]), plazo]);
    }
    clearTimeout(temporizador);

    if (vencido && this.enCurso.size > 0) {
      this.logger.warn(
        'apagado: tareas en segundo plano abandonadas al vencer el plazo',
        { abandonadas: this.enCurso.size },
      );
    }
  }
}
