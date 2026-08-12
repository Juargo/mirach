import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../../application/ports/movimientos-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_ID_TO_BUCKET } from './bucket-ids';
import { foldCategoria } from './fold-categoria';
import { ICryptoService } from '../../application/ports/crypto-service.port';

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
 * Fold categoria → { id, nombre } | null (CATAPI-05, CAT037-06): vía
 * foldCategoria (fold-categoria.ts), que resuelve por `nombre`, no por un id
 * físico fijo — compartido con PrismaDetalleBucketRepository.
 *
 * `descripcion` se descifra AQUÍ, en infra (ADR-013) — este reader alimenta
 * la respuesta HTTP de `GET /api/movimientos`; sin descifrar, el cliente
 * recibiría el ciphertext en vez de la descripción real. US-035 Slice 2:
 * `account.numeroCuenta` también se descifra acá, mismo motivo — el port
 * (`MovimientoMesRow`) sigue siendo plaintext-facing.
 */
export class PrismaMovimientosMesRepository implements IMovimientosMesReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

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
        descripcion: this.crypto.decrypt(row.descripcion),
        cargo: row.cargo,
        abono: row.abono,
        bucket,
        categoria: foldCategoria(row.categoria),
        banco: row.account.banco,
        tipoCuenta: row.account.tipoCuenta,
        numeroCuenta: this.crypto.decrypt(row.account.numeroCuenta),
      };
    });
  }
}
