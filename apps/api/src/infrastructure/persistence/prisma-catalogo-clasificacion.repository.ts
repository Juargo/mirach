import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ICatalogoClasificacion } from '../../application/ports/catalogo-clasificacion.port';
import { PatronClasificacion, MatchType } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import { PrismaService } from './prisma.service';

/**
 * PrismaCatalogoClasificacionRepository — implementación del port ICatalogoClasificacion.
 *
 * Carga todos los PatronClasificacion de la BD (incluye la relación con BucketPresupuesto),
 * los mapea a VOs de dominio y los devuelve en memoria. Un catálogo vacío es Result.ok([]).
 * Cualquier error de Prisma se mapea a Result.fail(CategorizacionFallidaError): nunca lanza.
 *
 * La carga es por llamada (decisión de diseño 3): sin caché de módulo para que
 * los cambios de seed se reflejen sin reiniciar.
 */
export class PrismaCatalogoClasificacionRepository implements ICatalogoClasificacion {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>> {
    try {
      const rows = await this.prisma.patronClasificacion.findMany({
        include: { bucket: true },
        orderBy: { prioridad: 'asc' },
      });

      const patrones = rows.map(
        (row) =>
          new PatronClasificacion({
            id: row.id,
            patron: row.patron,
            matchType: row.matchType as MatchType,
            bucket: row.bucket.nombre as Bucket,
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
