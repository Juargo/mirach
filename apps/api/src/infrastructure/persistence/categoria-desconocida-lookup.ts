import type { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

/** Forma mínima que necesita el fold de display — YAGNI, sin `bucket`/`esInterna`/`icono`. */
export interface CategoriaDesconocidaDeseos {
  readonly id: string;
  readonly nombre: string;
}

/**
 * buscarCategoriaDesconocidaDeseos — lookup, scoped por `userId`
 * (RNF-SEC-006), de la categoría interna `Desconocido` de `Bucket.Deseos`
 * (issue #778 tramo 5b) — el destino de DISPLAY para una fila con
 * `bucketId IS NULL` cuyo `categoriaId` TAMBIÉN es null (el riesgo residual
 * documentado en `ProcessIngestaUseCase.revertirYRechazar`).
 *
 * Comparte el MOTIVO con `seleccionarCategoriaPorDefecto`
 * (`categoria-por-defecto.ts`, usado en ESCRITURA por la ingesta) pero es un
 * query INDEPENDIENTE y deliberadamente más angosto: ese helper es puro y
 * opera sobre un catálogo ya cargado con `listarConPatrones` — el pipeline
 * de escritura de todas formas necesita el catálogo completo para validar
 * overlays. Acá, en LECTURA (dashboard/drill-down), cargar el catálogo
 * completo con patrones en cada consulta sería wasteful — este query trae
 * solo `id`/`nombre` y los callers lo disparan LAZY (solo cuando el reader
 * efectivamente encuentra una fila `bucketId IS NULL`), nunca incondicional,
 * para no pagar un query de más en el camino feliz sin filas huérfanas —
 * y como mucho UNA VEZ por llamada al reader (no hay N+1).
 *
 * `findFirst` en vez de `findMany` + selección en memoria: la unicidad de
 * `(userId, bucketId, esInterna=true)` la garantiza el catálogo semilla (una
 * `Desconocido` por bucket por usuario) — misma asunción que
 * `seleccionarCategoriaInterna`.
 *
 * `null` (catálogo incompleto — el usuario no tiene su `Desconocido` de
 * Deseos) es un resultado VÁLIDO, no una excepción: el caller degrada a
 * `categoria: null` (cae en el grupo sintético "Sin categoría") en vez de
 * romper la lectura — ver el edge case documentado en los callers.
 */
export async function buscarCategoriaDesconocidaDeseos(
  prisma: PrismaClient,
  userId: string,
): Promise<CategoriaDesconocidaDeseos | null> {
  return prisma.categoria.findFirst({
    where: {
      userId, // USER ISOLATION — structural (RNF-SEC-006)
      bucketId: BUCKET_IDS[Bucket.Deseos],
      esInterna: true,
    },
    select: { id: true, nombre: true },
  });
}
