import { EstadoIngesta } from '@prisma/client';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { IRevertirIngestaFallidaWriter } from '../../application/ports/revertir-ingesta-fallida.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaRevertirIngestaFallidaRepository — implementación Prisma del port
 * IRevertirIngestaFallidaWriter (issue #778 tramo 5a-bis).
 *
 * `$transaction` INTERACTIVO (callback), NO el array-form que usa el resto
 * de este módulo (p. ej. `PrismaEliminarIngestaRepository`): acá el gate de
 * ownership/estado es un `updateMany` cuyo `count === 0` NO lanza — con el
 * array-form, un `deleteMany` "hermano" en el mismo array ya habría
 * commiteado para cuando revisamos ese `count`, dejando las transacciones
 * borradas con la `Ingesta` todavía en PROCESADA (justo la inconsistencia
 * que este tramo existe para eliminar). El callback permite `throw` ANTES
 * de tocar `Transaccion` cuando el `updateMany` no matcheó nada, forzando el
 * rollback de TODO (incluido ese UPDATE que sí corrió).
 *
 * Orden deliberado — UPDATE primero, DELETE después:
 *   1. `ingesta.updateMany({ id: ingestaId, userId, estado: PROCESADA })` →
 *      gate fail-closed: si la fila no existe, no es del usuario, o ya no
 *      está PROCESADA, `count === 0` y abortamos (throw) sin haber tocado
 *      ninguna `Transaccion`.
 *   2. `transaccion.deleteMany({ ingestaId, account: { userId } })` — mismo
 *      patrón `account: { userId }` que `PrismaTransaccionBucketRepository`
 *      (RNF-SEC-006, WHERE SQL, nunca en memoria).
 *
 * No hay orden hijo→padre forzado por la FK `Restrict` de
 * `Transaccion.ingesta` — a diferencia del borrado en cascada de US-018, acá
 * NO se borra la `Ingesta` (se preserva historial + el id), solo se UPDATEa
 * su `estado`.
 *
 * El CHECK `Ingesta_procesada_requires_account` (migración
 * 20260801000000_ingesta_userid_nullable_account_banco) exige
 * `accountId NOT NULL` SOLO cuando `estado = PROCESADA` — pasar a FALLIDA
 * nunca lo viola, así que `accountId` se deja intacto (no hace falta
 * nulearlo).
 */
export class PrismaRevertirIngestaFallidaRepository implements IRevertirIngestaFallidaWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async revertirYMarcarFallida(
    userId: string,
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const ingesta = await tx.ingesta.updateMany({
          where: { id: ingestaId, userId, estado: EstadoIngesta.PROCESADA },
          data: { estado: EstadoIngesta.FALLIDA, motivoFallo: motivo },
        });
        if (ingesta.count === 0) {
          // No existe, no es del usuario, o ya no estaba PROCESADA — no
          // debería pasar (se llama con el ingestaId recién creado en esta
          // misma corrida, milisegundos antes), pero fail-closed: abortamos
          // ANTES de borrar ninguna Transaccion (throw → rollback del
          // UPDATE de arriba también, la transacción entera no deja rastro).
          throw new Error(
            'la ingesta a revertir no existe, no es del usuario, o ya no estaba PROCESADA',
          );
        }
        await tx.transaccion.deleteMany({
          where: { ingestaId, account: { userId } },
        });
      });

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'falló la reversión de la ingesta tras el error del writer de categorización',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
