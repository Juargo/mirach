import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ICatalogoClasificacion } from '../../application/ports/catalogo-clasificacion.port';
import {
  PatronClasificacion,
  MatchType,
} from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaCatalogoClasificacionRepository — implementación del port ICatalogoClasificacion.
 *
 * Carga los PatronClasificacion del `userId` dueño del catálogo (US-037: catálogo
 * per-user, `where: { userId }` estructural en SQL — RNF-SEC-006, nunca un filtro
 * en memoria). Tras ADR-037/D-03, el `include` widened a
 * `{ categoria: { include: { bucket: true } } }` (antes `{ categoria: true }`,
 * que traía `bucketId` pero no el `nombre` del bucket) para construir la
 * categoría anidada COMPLETA que `PatronClasificacion` requiere — `bucket` es
 * ahora un getter que PROYECTA `categoria.bucket`, nunca un campo hermano
 * independiente. Un catálogo vacío es Result.ok([]). Cualquier error de
 * Prisma se mapea a Result.fail(CategorizacionFallidaError): nunca lanza.
 *
 * La carga es por llamada (decisión de diseño 3): sin caché de módulo para que
 * los cambios de seed se reflejen sin reiniciar.
 */
export class PrismaCatalogoClasificacionRepository implements ICatalogoClasificacion {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(
    userId: string,
  ): Promise<
    Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>
  > {
    try {
      const rows = await this.prisma.patronClasificacion.findMany({
        where: { userId },
        include: { categoria: { include: { bucket: true } } },
        orderBy: { prioridad: 'asc' },
      });

      const patrones = rows.map(
        (row) =>
          new PatronClasificacion({
            id: row.id,
            patron: row.patron,
            matchType: row.matchType as MatchType,
            categoria: {
              id: row.categoria.id,
              nombre: row.categoria.nombre,
              bucket: row.categoria.bucket.nombre as Bucket,
            },
            prioridad: row.prioridad,
          }),
      );

      return Result.ok(patrones);
    } catch (error) {
      return Result.fail(
        new CategorizacionFallidaError(
          'no se pudo cargar el catálogo de clasificación',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
