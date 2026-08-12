import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ITransaccionBucketWriter } from '../../application/ports/transaccion-bucket-writer.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { agruparPorCategoriaBucket } from '../../application/services/agrupar-por-categoria-bucket';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

/**
 * PrismaTransaccionBucketRepository — implementación del port ITransaccionBucketWriter.
 *
 * Agrupa las asignaciones por (categoria, bucket) y emite un updateMany por
 * grupo dentro de un único prisma.$transaction, escribiendo `categoriaId` +
 * `bucketId` ATÓMICAMENTE en la misma fila (US-013, CAT-02: el bucket
 * escrito es siempre el que ya viene derivado de la categoría — nunca puede
 * quedar desincronizado entre las dos columnas). El mapeo Bucket enum → id
 * físico usa BUCKET_IDS (global, sin cambios). El mapeo Categoria enum → id
 * físico YA NO usa CATEGORIA_IDS (mapa global fijo): US-037 hace el catálogo
 * per-user, así que se resuelve con UN `categoria.findMany({where:{userId}})`
 * del usuario dueño de la ingesta (design.md §4.2).
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → Result.ok({ actualizadas: 0 })
 * sin tocar la BD.
 */
export class PrismaTransaccionBucketRepository implements ITransaccionBucketWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async asignarCategorizacion(
    userId: string,
    ingestaId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoria: Categoria | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>> {
    if (asignaciones.length === 0) {
      return Result.ok({ actualizadas: 0 });
    }

    try {
      // Agrupar por (categoria, bucket) para emitir un updateMany por grupo
      // (más eficiente y mantiene la atomicidad vía $transaction). Dos
      // categorías distintas que derivan al MISMO bucket (p.ej. Supermercado
      // y Combustible → Necesidades) deben seguir siendo grupos separados,
      // porque categoriaId difiere. Grouping es lógica pura compartida con
      // backfill-categorias.ts (DRY, ver agrupar-por-categoria-bucket.ts).
      const grupos = agruparPorCategoriaBucket(
        asignaciones.map(({ transaccionId, categoria, bucket }) => ({
          id: transaccionId,
          categoria,
          bucket,
        })),
      );

      // Resolver categoría enum → id físico SOLO si algún grupo lo necesita
      // — una ingesta puramente Ingreso/SinCategoria no toca la tabla
      // Categoria en absoluto.
      let categoriaIds: Map<Categoria, string> | undefined;
      if (grupos.some((g) => g.categoria !== null)) {
        const rows = await this.prisma.categoria.findMany({
          where: { userId },
          select: { id: true, nombre: true },
        });
        categoriaIds = new Map(
          rows.map((row) => [row.nombre as Categoria, row.id]),
        );
      }

      // Double-lock scope isolation (RNF-SEC-006): WHERE id IN (...) AND ingestaId = ?
      // ensures a bad id list can never bleed into another ingesta's rows.
      const operaciones = grupos.map(({ categoria, bucket, ids }) => {
        let categoriaId: string | null = null;
        if (categoria) {
          const resuelto = categoriaIds?.get(categoria);
          if (resuelto === undefined) {
            // Catálogo corrupto/incompleto para este usuario — el catch de
            // abajo lo convierte en Result.fail (nunca lanza al caller).
            throw new Error(
              `categoría "${categoria}" no encontrada en el catálogo del usuario`,
            );
          }
          categoriaId = resuelto;
        }
        return () =>
          this.prisma.transaccion.updateMany({
            where: { id: { in: ids }, ingestaId },
            data: { categoriaId, bucketId: BUCKET_IDS[bucket] },
          });
      });

      const resultados = await this.prisma.$transaction(
        operaciones.map((op) => op()),
      );

      const actualizadas = resultados.reduce(
        (sum: number, r: { count: number }) => sum + r.count,
        0,
      );

      return Result.ok({ actualizadas });
    } catch (error) {
      return Result.fail(
        new CategorizacionFallidaError(
          'no se pudieron asignar las categorizaciones a las transacciones',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
