import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';
import { IngestaDemoSoloLecturaError } from '../../domain/errors/ingesta-demo-solo-lectura.error';
import { IEliminarIngestaWriter } from '../ports/eliminar-ingesta.port';
import { ILogger } from '../ports/logger.port';

/** Unión de errores de `EliminarIngestaUseCase` (issue #500: demo gate). */
export type EliminarIngestaError =
  | IngestaDemoSoloLecturaError
  | IngestaNoEncontradaError;

/**
 * EliminarIngestaUseCase — use case de escritura para el borrado en cascada
 * de una ingesta (US-018, ING-01/ING-02).
 *
 * Thin, Result-based, delega TODA la lógica de aislamiento + cascada al
 * writer (design.md §4.3). Nunca lanza. Mirrors
 * ReclasificarTransaccionUseCase menos el paso de validación de input — el
 * borrado no tiene input que validar más allá del `userId` de sesión y el
 * `:id` del path.
 *
 * Demo gate (issue #500, mirrors `EliminarCategoriaUseCase`): una sesión
 * demo corta ANTES de tocar el writer — ni siquiera se intenta la cascada.
 */
export class EliminarIngestaUseCase {
  constructor(
    private readonly writer: IEliminarIngestaWriter,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    /** Demo gate (issue #500) — una sesión demo no puede escribir. */
    esDemo: boolean;
    ingestaId: string;
  }): Promise<Result<void, EliminarIngestaError>> {
    if (input.esDemo) {
      return Result.fail(new IngestaDemoSoloLecturaError());
    }

    const result = await this.writer.eliminarConTransacciones(
      input.userId,
      input.ingestaId,
    );
    // `eliminarConTransacciones` no retorna conteos de cascada — solo
    // ingestaId (ID interno) + outcome (ADR-013: nunca userId en claro sería
    // PII, pero userId ya es un ID interno, no un dato personal directo).
    this.logger.debug('eliminar-ingesta: delete outcome', {
      ingestaId: input.ingestaId,
      eliminado: result.isOk(),
    });
    return result;
  }
}
