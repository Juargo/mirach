import { Result } from '../../shared/result';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';
import { IEliminarIngestaWriter } from '../../application/ports/eliminar-ingesta.port';
import { EstadoIngesta } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaEliminarIngestaRepository — implementación del port
 * IEliminarIngestaWriter (US-018 §3.1/§3.2, hardened post-4R-review for
 * US-004).
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
 * transacciones de B ya borradas y el atacante recibe un 404 limpio.
 *
 * Post-US-004 hardening: el scope ahora usa la columna DIRECTA
 * `Ingesta.userId` (mismo mecanismo que `prisma-listar-ingestas.reader.ts`),
 * no el join `account: { userId }` que usaba US-018. Motivo: tras US-004 las
 * filas FALLIDA tienen `accountId = null`, así que el join `account: {
 * userId }` NUNCA matchea una fila FALLIDA — borrar tu propia FALLIDA
 * devolvía 404 por ACCIDENTE (el join sin match), no por un contrato
 * explícito. Ambas cláusulas WHERE ahora gatean, además, por
 * `estado: PROCESADA` explícitamente: el diseño aprobado (D8) YA decidía que
 * borrar una FALLIDA está fuera de alcance esta sprint — este cambio hace
 * esa decisión un contrato deliberado y testeado en el backend, en vez de un
 * efecto secundario del join. Semántica sin cambios para PROCESADA (mismo
 * comportamiento US-018): solo una fila PROCESADA del usuario que la pide es
 * borrable; cualquier otra combinación (ajena, FALLIDA, PENDIENTE) no
 * matchea → `IngestaNoEncontradaError` (404, anti-enumeration).
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
          // STRUCTURAL isolation (RNF-SEC-006) via the direct userId column
          // + explicit PROCESADA gate (FALLIDA is not deletable, D8).
          ingesta: { userId, estado: EstadoIngesta.PROCESADA },
        },
      }),
      // (2) parent — its count IS the ownership+state gate.
      this.prisma.ingesta.deleteMany({
        where: { id: ingestaId, userId, estado: EstadoIngesta.PROCESADA },
      }),
    ]);

    if (parent.count === 0) {
      // Not found, not owned, or not PROCESADA — merged, indistinguishable
      // (anti-enumeration).
      return Result.fail(new IngestaNoEncontradaError(ingestaId));
    }

    return Result.ok(undefined);
  }
}
