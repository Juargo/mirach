import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../../application/ports/reclasificar-categoria.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaReclasificarCategoriaRepository — implementación del port
 * IReclasificarCategoriaWriter (US-013 S4, CATAPI-01/03/04; ADR-037/Q5,
 * CAT037-04, ADR-042).
 *
 * `categoriaId` YA NO se resuelve vía `CATEGORIA_IDS` (mapa global fijo) ni
 * por nombre: la fila `Categoria` REAL del propio usuario se busca por
 * `(id, userId)` — primary key + predicado de propiedad, a lo sumo una fila
 * por construcción (design.md D-05). Esto es en sí mismo una garantía de
 * aislamiento (un caller solo puede resolver su propia fila).
 *
 * FORBIDDEN (D-05): `findFirst({ where: { userId, nombre } })` — compila,
 * type-checkea y pasa los tests, pero devuelve UNA de N filas homónimas
 * entre buckets, elegida por la base de datos. Este método NUNCA debe volver
 * a resolver por `nombre` en el write path.
 *
 * Un `categoriaId` que no resuelve a ninguna fila del catálogo del usuario
 * (no existe o no es suya, indistinguibles) ⇒
 * `Result.fail(CategoriaDesconocidaError)` — nunca lanza y nunca enumera el
 * catálogo.
 *
 * `bucket` ya NO viaja como parámetro — se deriva de la relación
 * `Categoria.bucket` en el mismo `findFirst` (CAT-02: el bucket siempre
 * viene de la categoría, nunca aceptado independientemente).
 *
 * `updateMany` con `WHERE { id, account: { userId } }` es el aislamiento
 * ESTRUCTURAL por userId (RNF-SEC-006) — mismo patrón que todo repo de
 * lectura existente (prisma-movimientos-mes, prisma-resumen-mes,
 * prisma-detalle-bucket). `count === 0` fusiona "no existe" y "no es del
 * usuario" en un único TransaccionNoEncontradaError (anti-enumeration) —
 * nunca se distinguen los dos casos.
 *
 * `categoriaId` + `bucketId` se escriben ATÓMICAMENTE en la misma llamada
 * `updateMany` — el bucket ya viene derivado de la categoría (nunca se
 * recalcula aquí ni se acepta de otra fuente), así el caché denormalizado
 * nunca puede quedar desincronizado de la categoría (design.md §2). Sin
 * `$transaction` envolviendo el lookup + el update (KISS, design.md §4.3):
 * la categoría es estable y el peor caso de un delete concurrente es un
 * error de FK → 500, que es el resultado correcto de todas formas.
 *
 * `categoria` en el DTO de retorno se lee de `categoriaRow.nombre` — nunca
 * se hace eco del input, que ahora es un id, no un nombre (design.md D-06).
 */
export class PrismaReclasificarCategoriaRepository implements IReclasificarCategoriaWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async reasignar(
    userId: string,
    transaccionId: string,
    categoriaId: string,
  ): Promise<
    Result<
      ReclasificarCategoriaResult,
      TransaccionNoEncontradaError | CategoriaDesconocidaError
    >
  > {
    const categoriaRow = await this.prisma.categoria.findFirst({
      where: { id: categoriaId, userId }, // STRUCTURAL isolation (RNF-SEC-006)
      include: { bucket: true },
    });
    if (categoriaRow === null) {
      return Result.fail(new CategoriaDesconocidaError(categoriaId));
    }

    const bucket = categoriaRow.bucket.nombre as Bucket;

    const { count } = await this.prisma.transaccion.updateMany({
      where: { id: transaccionId, account: { userId } }, // STRUCTURAL isolation (RNF-SEC-006)
      data: {
        categoriaId: categoriaRow.id,
        bucketId: categoriaRow.bucketId,
      },
    });

    if (count === 0) {
      // Not found OR not owned — merged, indistinguishable (anti-enumeration).
      return Result.fail(new TransaccionNoEncontradaError(transaccionId));
    }

    return Result.ok({
      id: transaccionId,
      categoriaId: categoriaRow.id,
      categoria: categoriaRow.nombre,
      bucket,
    });
  }
}
