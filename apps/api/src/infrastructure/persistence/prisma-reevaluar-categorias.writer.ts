import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { IReevaluarCategoriasWriter } from '../../application/ports/reevaluar-categorias-writer.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { agruparPorCategoriaBucket } from '../../application/services/agrupar-por-categoria-bucket';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Cap de ids por `updateMany` — nunca un único statement con un `IN (...)`
 * arbitrariamente grande (PR #200, backfill-descripcion-encryption.ts). Un
 * grupo (categoriaId, bucket) que exceda este tamaño se parte en varios
 * `updateMany` — cada uno sigue siendo UN solo round-trip de red.
 */
const MAX_IDS_POR_UPDATE = 500;

/**
 * Cap de operaciones por `$transaction` — mismo motivo que
 * `MAX_IDS_POR_UPDATE`: un usuario con muchas categorías distintas produce
 * muchos grupos, y agruparlos TODOS en un único `$transaction` reproduciría
 * el mismo riesgo de timeout que PR #200 (ahí eran N `update()` individuales;
 * acá serían N `updateMany()` — el mismo problema de raíz: demasiados
 * round-trips bajo un solo timeout).
 */
const MAX_OPERACIONES_POR_TRANSACCION = 20;

/**
 * Timeout explícito del `$transaction` por lote — mismo valor que
 * `backfill-descripcion-encryption.ts` (el default de Prisma, 5s, es
 * riesgoso contra el pooler de Supabase con latencia de red variable).
 */
const TRANSACTION_TIMEOUT_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * PrismaReevaluarCategoriasWriter — implementación del port
 * IReevaluarCategoriasWriter (`POST /api/transacciones/reevaluar`).
 *
 * Agrupa las asignaciones por (categoriaId, bucket) — mismo `agrupar-por-
 * categoria-bucket.ts` compartido con `PrismaTransaccionBucketRepository` y
 * `backfill-categorias.ts` (DRY) — y emite un `updateMany` por grupo. A
 * diferencia de `PrismaTransaccionBucketRepository`, el `WHERE` NO lleva
 * `ingestaId`: el alcance de esta escritura es TODO el historial del usuario
 * (`{ id IN (...), account: { userId } }` — RNF-SEC-006, aislamiento
 * estructural).
 *
 * Batcheado desde el día uno (PR #200 — este repo ya se comió un timeout de
 * batch en producción): cada grupo se parte en `updateMany` de a lo sumo
 * `MAX_IDS_POR_UPDATE` ids, y las operaciones resultantes viajan en lotes de
 * a lo sumo `MAX_OPERACIONES_POR_TRANSACCION` dentro de `$transaction`, con
 * timeout/maxWait explícitos — nunca N updates sueltos ni un único statement
 * gigante.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → Result.ok({ actualizadas: 0 })
 * sin tocar la BD.
 */
export class PrismaReevaluarCategoriasWriter implements IReevaluarCategoriasWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async escribir(
    userId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoriaId: string | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>> {
    if (asignaciones.length === 0) {
      return Result.ok({ actualizadas: 0 });
    }

    try {
      const grupos = agruparPorCategoriaBucket(
        asignaciones.map(({ transaccionId, categoriaId, bucket }) => ({
          id: transaccionId,
          categoriaId,
          bucket,
        })),
      );

      // Expandir cada grupo en uno o más "jobs" acotados por MAX_IDS_POR_UPDATE.
      const jobs = grupos.flatMap(({ categoriaId, bucket, ids }) =>
        chunk(ids, MAX_IDS_POR_UPDATE).map((idsChunk) => ({
          categoriaId,
          bucket,
          ids: idsChunk,
        })),
      );

      let actualizadas = 0;
      for (const lote of chunk(jobs, MAX_OPERACIONES_POR_TRANSACCION)) {
        const operaciones = lote.map(({ categoriaId, bucket, ids }) =>
          this.prisma.transaccion.updateMany({
            where: { id: { in: ids }, account: { userId } },
            data: { categoriaId, bucketId: BUCKET_IDS[bucket] },
          }),
        );

        const resultados = await this.prisma.$transaction(operaciones, {
          timeout: TRANSACTION_TIMEOUT_MS,
          maxWait: TRANSACTION_MAX_WAIT_MS,
        });

        actualizadas += resultados.reduce(
          (sum: number, r: { count: number }) => sum + r.count,
          0,
        );
      }

      return Result.ok({ actualizadas });
    } catch (error) {
      return Result.fail(
        new CategorizacionFallidaError(
          'no se pudieron escribir las categorías reevaluadas',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
