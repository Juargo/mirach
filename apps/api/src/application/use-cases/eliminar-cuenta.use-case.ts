import { Result } from '../../shared/result';
import { ConfirmacionEliminacionInvalidaError } from '../../domain/errors/confirmacion-eliminacion-invalida.error';
import { ICuentaRepository } from '../ports/cuenta-repository.port';
import { IRevocadorIdentidadExterna } from '../ports/revocador-identidad-externa.port';
import { ILogger } from '../ports/logger.port';

export type EliminarCuentaError = ConfirmacionEliminacionInvalidaError;

/** Valor exacto que el usuario debe enviar para confirmar el borrado. */
export const CONFIRMACION_ELIMINAR_CUENTA = 'ELIMINAR';

/**
 * EliminarCuentaUseCase — `DELETE /api/cuenta`.
 *
 * Decisiones:
 * - Autorización: sesión válida + confirmación explícita (sin exigir sesión
 *   reciente ni re-autenticación con el proveedor; decisión del usuario,
 *   2026-10-04).
 * - Orden: confirmación → revocación externa → borrado. La revocación va
 *   ANTES porque lo que necesita (tokens guardados) se destruye con el
 *   borrado. Es best-effort: si falla, se loguea un warn SIN el mensaje del
 *   error (podría arrastrar tokens) y el borrado sigue — el derecho a borrar
 *   no puede depender de que Apple esté disponible.
 * - Revocar antes de borrar, y el caso "revocó pero el borrado falló": se
 *   acepta. El refresh token de Apple vive en la fila que el borrado destruye,
 *   así que revocar DESPUÉS exigiría leerlo antes y, si Apple fallara tras un
 *   borrado exitoso, ya no habría forma de reintentar (se incumpliría la
 *   5.1.1(v) sin remedio). Si el borrado falla (la petición termina en 500) el
 *   usuario conserva la cuenta; el único costo es que su autorización de Apple
 *   quedó revocada: al volver a entrar, Apple le pide consentir de nuevo, el
 *   login resuelve por `appleSub` y el nuevo `authorizationCode` reemplaza el
 *   token guardado.
 * - Idempotencia: repetir la operación sobre un usuario ya borrado es un
 *   éxito (el repositorio no falla). En la práctica la sesión ya no existe y
 *   el session middleware responde 401 antes de llegar acá.
 * - Auditoría: una línea info solo con el userId (nunca email, nombre ni
 *   tokens), emitida después de confirmar el borrado.
 */
export class EliminarCuentaUseCase {
  constructor(
    private readonly cuentas: ICuentaRepository,
    private readonly revocador: IRevocadorIdentidadExterna,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    confirmacion: string | undefined;
  }): Promise<Result<void, EliminarCuentaError>> {
    if (input.confirmacion !== CONFIRMACION_ELIMINAR_CUENTA) {
      return Result.fail(new ConfirmacionEliminacionInvalidaError());
    }

    try {
      await this.revocador.revocar(input.userId);
    } catch (err) {
      this.logger.warn('eliminar-cuenta: revocación externa fallida', {
        userId: input.userId,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }

    await this.cuentas.eliminar(input.userId);
    this.logger.info('eliminar-cuenta: cuenta eliminada', {
      userId: input.userId,
    });
    return Result.ok(undefined);
  }
}
