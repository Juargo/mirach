import type {
  IDerechosPlusWriter,
  ResultadoCambioDerechos,
} from '../ports/derechos-plus-writer.port';
import type { ILogger } from '../ports/logger.port';
import type { CambioDerechosPlus } from '../../domain/value-objects/cambio-derechos-plus';

export interface ProcesarEventoSuscripcionCommand {
  /** Id del evento en el proveedor: la clave de idempotencia. */
  readonly eventoId: string;
  /** Tipo del evento tal como lo nombra el proveedor; solo para el log. */
  readonly tipoEvento: string;
  readonly cambio: CambioDerechosPlus;
}

export type ResultadoEventoSuscripcion = ResultadoCambioDerechos | 'ignorado';

/**
 * ProcesarEventoSuscripcionUseCase — aplica a los derechos de Plus lo que
 * informa un evento de la tienda (ADR-012 §1, ADR-015 §5). Todo resultado es un
 * evento atendido: el webhook responde 200 y el proveedor no reintenta. Un
 * fallo de infraestructura no se atrapa, así el proveedor sí reintenta.
 *
 * El log nunca lleva el id del usuario: `eventoId` basta para buscarlo en el
 * panel del proveedor.
 */
export class ProcesarEventoSuscripcionUseCase {
  constructor(
    private readonly derechos: IDerechosPlusWriter,
    private readonly logger: ILogger,
  ) {}

  async execute(
    command: ProcesarEventoSuscripcionCommand,
  ): Promise<ResultadoEventoSuscripcion> {
    const { eventoId, tipoEvento, cambio } = command;
    const contexto = { eventoId, tipoEvento, cambio: cambio.tipo };

    if (cambio.tipo === 'ignorado') {
      this.logger.info('Evento de suscripción procesado', {
        ...contexto,
        resultado: 'ignorado',
        motivo: cambio.motivo,
      });
      return 'ignorado';
    }

    const resultado = await this.derechos.aplicar(eventoId, cambio);
    const registrar = resultado === 'usuario_desconocido' ? 'warn' : 'info';
    this.logger[registrar]('Evento de suscripción procesado', {
      ...contexto,
      resultado,
    });
    return resultado;
  }
}
