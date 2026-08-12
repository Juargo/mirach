import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../../application/ports/detalle-bucket.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';
import { foldCategoria } from './fold-categoria';
import { ICryptoService } from '../../application/ports/crypto-service.port';

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
 * Depende de `PrismaClient` (base), no de `PrismaService` (artefacto Nest) —
 * así el composition root de Express le pasa un cliente plano (ADR-028).
 *
 * Fold categoria → { id, nombre } | null (CATAPI-05, CAT037-06): vía
 * foldCategoria (fold-categoria.ts), que resuelve por `nombre`, no por un id
 * físico fijo — compartido con PrismaMovimientosMesRepository.
 *
 * `descripcion` se descifra AQUÍ, en infra (ADR-013) — este reader alimenta
 * la respuesta HTTP de `GET /api/buckets/:bucket`; sin descifrar, el cliente
 * recibiría el ciphertext en vez de la descripción real. US-035 Slice 2:
 * `account.numeroCuenta` también se descifra acá, mismo motivo — el port
 * (`DetalleBucketRow`) sigue siendo plaintext-facing.
 */
export class PrismaDetalleBucketRepository implements IDetalleBucketReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async findByPeriodoYBucket(
    userId: string,
    periodo: PeriodoMes,
    bucket: Bucket,
  ): Promise<ReadonlyArray<DetalleBucketRow>> {
    const bucketFilter =
      bucket === Bucket.SinCategoria
        ? {
            OR: [
              { bucketId: null },
              { bucketId: BUCKET_IDS[Bucket.SinCategoria] },
            ],
          }
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
        categoria: { select: { id: true, nombre: true } },
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
      descripcion: this.crypto.decrypt(row.descripcion),
      cargo: row.cargo,
      abono: row.abono,
      categoria: foldCategoria(row.categoria),
      banco: row.account.banco,
      tipoCuenta: row.account.tipoCuenta,
      numeroCuenta: this.crypto.decrypt(row.account.numeroCuenta),
    }));
  }
}
