import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';
import { IEliminarIngestaWriter } from '../ports/eliminar-ingesta.port';

/**
 * EliminarIngestaUseCase — use case de escritura para el borrado en cascada
 * de una ingesta (US-018, ING-01/ING-02).
 *
 * Thin, Result-based, delega TODA la lógica de aislamiento + cascada al
 * writer (design.md §4.3). Nunca lanza. Mirrors
 * ReclasificarTransaccionUseCase menos el paso de validación de input — el
 * borrado no tiene input que validar más allá del `userId` de sesión y el
 * `:id` del path.
 */
export class EliminarIngestaUseCase {
  constructor(private readonly writer: IEliminarIngestaWriter) {}

  execute(input: {
    userId: string;
    ingestaId: string;
  }): Promise<Result<void, IngestaNoEncontradaError>> {
    return this.writer.eliminarConTransacciones(input.userId, input.ingestaId);
  }
}
