import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../../application/ports/movimientos-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_ID_TO_BUCKET } from './bucket-ids';
import { foldCategoriaId } from './categoria-ids';

/**
 * PrismaMovimientosMesRepository — implementación del port de lectura mensual
 * para la consolidación de movimientos (US-014).
 *
 * Filtra por userId a través del Account (user isolation estructural en la
 * cláusula WHERE — no en app-layer). Los montos cargo/abono son BigInt y se
 * devuelven sin conversión (la serialización a string ocurre solo en el DTO HTTP).
 *
 * Orden determinista: fecha asc, id asc como tiebreak para same-date rows.
 *
 * Fold bucketId → Bucket (MOV-01): mirroring prisma-resumen-mes.repository.ts.
 * Este es un `map` por fila, no un `groupBy` acumulador — foldear una fila a
 * SinCategoria nunca reclasifica otra fila (SC-03 aplicado por fila, no hay
 * "add vs overwrite" porque no hay merge).
 *
 * Fold categoriaId → { id, nombre } | null (CATAPI-05): vía foldCategoriaId
 * (categoria-ids.ts) — compartido con PrismaDetalleBucketRepository.
 */
export class PrismaMovimientosMesRepository implements IMovimientosMesReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPeriodo(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<MovimientoMesRow>> {
    const rows = await this.prisma.transaccion.findMany({
      where: {
        account: { userId },
        fecha: { gte: periodo.desde, lt: periodo.hasta },
      },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
        bucketId: true,
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

    return rows.map((row) => {
      // Resolve physical bucketId → domain Bucket enum.
      // null bucketId → SinCategoria (degradation from US-012).
      // Unrecognized non-null bucketId → also SinCategoria (defensive).
      const bucket: Bucket =
        row.bucketId === null
          ? Bucket.SinCategoria
          : (BUCKET_ID_TO_BUCKET.get(row.bucketId) ?? Bucket.SinCategoria);

      return {
        id: row.id,
        fecha: row.fecha,
        descripcion: row.descripcion,
        cargo: row.cargo,
        abono: row.abono,
        bucket,
        categoria: foldCategoriaId(row.categoriaId),
        banco: row.account.banco,
        tipoCuenta: row.account.tipoCuenta,
        numeroCuenta: row.account.numeroCuenta,
      };
    });
  }
}
