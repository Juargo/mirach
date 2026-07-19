import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../../application/ports/detalle-bucket.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PrismaService } from './prisma.service';
import { BUCKET_IDS } from './bucket-ids';
import { foldCategoriaId } from './categoria-ids';

/**
 * PrismaDetalleBucketRepository — implementación del port de lectura para el
 * detalle de un bucket (US-017).
 *
 * Implements IDetalleBucketReader. Filtra por userId a través del Account
 * (user isolation estructural en la cláusula WHERE) y por el período con la
 * ventana half-open [desde, hasta), idéntico a PrismaMovimientosMesRepository.
 *
 * Correctness-critical: SinCategoria null-fold — debe reproducir EXACTAMENTE
 * el mismo fold que PrismaResumenMesRepository (SC-03), o los totales del
 * drill-down no reconciliarán con la tarjeta de resumen. Para
 * Bucket.SinCategoria, el filtro es `OR: [{bucketId: null}, {bucketId: 'bucket-sincategoria'}]`;
 * para cualquier otro bucket, `bucketId: BUCKET_IDS[bucket]`.
 *
 * Constructor takes PrismaService directly (no NestJS decorators — clean arch).
 *
 * Fold categoriaId → { id, nombre } | null (CATAPI-05): vía foldCategoriaId
 * (categoria-ids.ts) — compartido con PrismaMovimientosMesRepository.
 */
export class PrismaDetalleBucketRepository implements IDetalleBucketReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriodoYBucket(
    userId: string,
    periodo: PeriodoMes,
    bucket: Bucket,
  ): Promise<ReadonlyArray<DetalleBucketRow>> {
    const bucketFilter =
      bucket === Bucket.SinCategoria
        ? { OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.SinCategoria] }] }
        : { bucketId: BUCKET_IDS[bucket] };

    const rows = await this.prisma.transaccion.findMany({
      where: {
        account: { userId }, // USER ISOLATION — structural
        fecha: { gte: periodo.desde, lt: periodo.hasta }, // half-open [desde, hasta)
        ...bucketFilter,
      },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
        categoriaId: true,
        account: {
          select: {
            banco: true,
            tipoCuenta: true,
            numeroCuenta: true,
          },
        },
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      descripcion: row.descripcion,
      cargo: row.cargo,
      abono: row.abono,
      categoria: foldCategoriaId(row.categoriaId),
      banco: row.account.banco,
      tipoCuenta: row.account.tipoCuenta,
      numeroCuenta: row.account.numeroCuenta,
    }));
  }
}
