import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { MovimientoDemoSoloLecturaError } from '../../domain/errors/movimiento-demo-solo-lectura.error';
import { IEliminarMovimientoManualWriter } from '../ports/eliminar-movimiento-manual.port';
import { ILogger } from '../ports/logger.port';

/** Unión de errores de `EliminarMovimientoManualUseCase` (ADR-040). */
export type EliminarMovimientoManualError =
  | MovimientoDemoSoloLecturaError
  | TransaccionNoEncontradaError;

/**
 * EliminarMovimientoManualUseCase — use case de escritura para el borrado de
 * un movimiento manual (correccion-movimientos-manuales, ADR-040, D-01).
 *
 * Thin, Result-based, delega TODA la lógica de aislamiento + scoping al
 * writer. Nunca lanza. Mirrors EliminarIngestaUseCase minus el paso de
 * cascada (Transaccion es una hoja, sin `$transaction`).
 *
 * Demo gate (DEL-03): una sesión demo corta ANTES de tocar el writer — ni
 * siquiera se intenta el borrado.
 */
export class EliminarMovimientoManualUseCase {
  constructor(
    private readonly writer: IEliminarMovimientoManualWriter,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    /** Demo gate — una sesión demo no puede escribir. */
    esDemo: boolean;
    transaccionId: string;
  }): Promise<Result<void, EliminarMovimientoManualError>> {
    if (input.esDemo) {
      return Result.fail(new MovimientoDemoSoloLecturaError());
    }

    const result = await this.writer.eliminarManual(
      input.userId,
      input.transaccionId,
    );
    // `eliminarManual` no retorna montos — solo transaccionId (ID interno) +
    // outcome (ADR-013: nunca montos ni userId en claro en logs).
    this.logger.debug('eliminar-movimiento-manual: delete outcome', {
      transaccionId: input.transaccionId,
      eliminado: result.isOk(),
    });
    return result;
  }
}
