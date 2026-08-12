import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../../application/ports/reclasificar-categoria.port';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

/**
 * PrismaReclasificarCategoriaRepository — implementación del port
 * IReclasificarCategoriaWriter (US-013 S4, CATAPI-01/03/04; US-037 CAT037-04).
 *
 * `categoriaId` YA NO se resuelve vía `CATEGORIA_IDS` (mapa global fijo):
 * primero busca la fila `Categoria` REAL del propio usuario por la clave
 * compuesta `(userId, nombre)` — esto es en sí mismo una garantía de
 * aislamiento (un caller solo puede resolver su propia fila, design.md §4.3).
 * Si esa fila no existe, el invariante "todo usuario tiene su catálogo
 * copiado al crearse" está roto: se LANZA (nunca Result.fail) — el
 * middleware de errores lo traduce a 500. Deliberadamente NO se mapea a
 * TransaccionNoEncontradaError: reportar "transacción no encontrada" cuando
 * la falla real es un catálogo corrupto mandaría el debugging en la
 * dirección equivocada.
 *
 * `updateMany` con `WHERE { id, account: { userId } }` es el aislamiento
 * ESTRUCTURAL por userId (RNF-SEC-006) — mismo patrón que todo repo de
 * lectura existente (prisma-movimientos-mes, prisma-resumen-mes,
 * prisma-detalle-bucket). `count === 0` fusiona "no existe" y "no es del
 * usuario" en un único TransaccionNoEncontradaError (anti-enumeration) —
 * nunca se distinguen los dos casos.
 *
 * `categoriaId` + `bucketId` se escriben ATÓMICAMENTE en la misma llamada
 * `updateMany` — el bucket ya viene derivado por el use case (nunca se
 * recalcula aquí), así el caché denormalizado nunca puede quedar
 * desincronizado de la categoría (design.md §2). Sin `$transaction`
 * envolviendo el lookup + el update (KISS, design.md §4.3): la categoría es
 * estable y el peor caso de un delete concurrente es un error de FK → 500,
 * que es el resultado correcto de todas formas.
 */
export class PrismaReclasificarCategoriaRepository implements IReclasificarCategoriaWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async reasignar(
    userId: string,
    transaccionId: string,
    categoria: Categoria,
    bucket: Bucket,
  ): Promise<
    Result<ReclasificarCategoriaResult, TransaccionNoEncontradaError>
  > {
    const categoriaRow = await this.prisma.categoria.findUnique({
      where: { userId_nombre: { userId, nombre: categoria } },
      select: { id: true },
    });
    if (categoriaRow === null) {
      throw new Error(
        `categoría "${categoria}" no encontrada en el catálogo del usuario (copia rota)`,
      );
    }

    const { count } = await this.prisma.transaccion.updateMany({
      where: { id: transaccionId, account: { userId } }, // STRUCTURAL isolation (RNF-SEC-006)
      data: {
        categoriaId: categoriaRow.id,
        bucketId: BUCKET_IDS[bucket],
      },
    });

    if (count === 0) {
      // Not found OR not owned — merged, indistinguishable (anti-enumeration).
      return Result.fail(new TransaccionNoEncontradaError(transaccionId));
    }

    return Result.ok({
      id: transaccionId,
      categoriaId: categoriaRow.id,
      categoria,
      bucket,
    });
  }
}
