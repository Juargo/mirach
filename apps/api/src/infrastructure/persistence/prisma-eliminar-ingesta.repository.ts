import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';
import { IEliminarIngestaWriter } from '../../application/ports/eliminar-ingesta.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaEliminarIngestaRepository — implementación del port
 * IEliminarIngestaWriter (US-018, design.md §3.1/§3.2).
 *
 * Array-form `$transaction`, mirrors `PrismaIngestaRepository.commit()`.
 * Children FIRST — MANDATORIO bajo la FK `Restrict` de `Transaccion.ingesta`
 * (schema.prisma:112, sin `onDelete` explícito). AMBAS cláusulas WHERE están
 * `userId`-scoped — esta es la decisión de correctitud que sostiene todo el
 * cambio (design.md §3.2):
 *
 * Si el `deleteMany` del hijo NO estuviera scoped por userId, un atacante
 * `userId=A` que apunta a una ingesta de `userId=B` borraría IGUAL todas las
 * transacciones de B (statement 1 no discrimina), y solo el conteo del padre
 * (statement 2) daría 0 — un `deleteMany` con `count===0` es un ÉXITO, no un
 * error de transacción, así que el `$transaction` COMMITEA con las
 * transacciones de B ya borradas y el atacante recibe un 404 limpio. Por eso
 * el hijo se scope vía la relación al padre: `ingesta: { account: { userId } }`
 * — así, si la ingesta no es del caller, el hijo borra CERO filas.
 *
 * `deleteMany` (no `delete`) en el padre: retorna `{ count: 0 }` en vez de
 * lanzar — el conteo ES el gate de ownership, indistinguible de "no existe"
 * (anti-enumeration, mismo patrón que el `updateMany` de reclasificar).
 *
 * No hace try/catch de errores de infraestructura (design.md §3.4, mirrors
 * PrismaReclasificarCategoriaRepository): el ÚNICO error de dominio es
 * IngestaNoEncontradaError (count===0); un fallo de DB propaga como
 * excepción hacia el route handler → errorMiddleware → 500.
 */
export class PrismaEliminarIngestaRepository implements IEliminarIngestaWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async eliminarConTransacciones(
    userId: string,
    ingestaId: string,
  ): Promise<Result<void, IngestaNoEncontradaError>> {
    const [, parent] = await this.prisma.$transaction([
      // (1) children FIRST — REQUIRED under FK Restrict.
      this.prisma.transaccion.deleteMany({
        where: {
          ingestaId,
          ingesta: { account: { userId } }, // STRUCTURAL isolation (RNF-SEC-006)
        },
      }),
      // (2) parent — its count IS the ownership gate.
      this.prisma.ingesta.deleteMany({
        where: { id: ingestaId, account: { userId } },
      }),
    ]);

    if (parent.count === 0) {
      // Not found OR not owned — merged, indistinguishable (anti-enumeration).
      return Result.fail(new IngestaNoEncontradaError(ingestaId));
    }

    return Result.ok(undefined);
  }
}
