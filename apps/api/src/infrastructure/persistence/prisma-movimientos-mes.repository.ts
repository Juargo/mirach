import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../../application/ports/movimientos-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { resolverBucket } from './bucket-ids';
import { foldCategoria } from './fold-categoria';
import { buscarCategoriaDesconocidaDeseos } from './categoria-desconocida-lookup';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { appLogger } from '../logging/app-logger';

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
 * Fold bucketId → Bucket (MOV-01): vía `resolverBucket` (bucket-ids.ts) —
 * MISMA función que usan prisma-resumen-mes/prisma-resumen-anual (issue #778
 * tramo 5b: dejó de duplicar la comparación inline sobre
 * `BUCKET_ID_TO_BUCKET`, ahora reconciliado con las otras dos). Este es un
 * `map` por fila, no un `groupBy` acumulador — foldear una fila a Deseos
 * nunca reclasifica otra fila (SC-03 aplicado por fila, no hay "add vs
 * overwrite" porque no hay merge).
 *
 * Fold categoria → { id, nombre } | null (CATAPI-05, CAT037-06): vía
 * foldCategoria (fold-categoria.ts), que resuelve por `nombre`, no por un id
 * físico fijo — compartido con PrismaDetalleBucketRepository.
 *
 * Fold Desconocido (issue #778 tramo 5b, decisión del humano): una fila con
 * `bucketId IS NULL` Y `categoriaId IS NULL` (riesgo residual de
 * `ProcessIngestaUseCase.revertirYRechazar`) no muestra `categoria: null`
 * ("Sin categoría") — se le asigna la `Desconocido` DE Deseos
 * (`buscarCategoriaDesconocidaDeseos`, lazy, UNA query por llamada, solo si
 * aparece al menos una fila así). Catálogo incompleto (sin `Desconocido` de
 * Deseos) degrada a `categoria: null` sin romper la lectura.
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

    // Lazy, at most ONE extra query per call — only fired when a null-bucket
    // row with no categoria actually shows up (never unconditionally).
    const filasHuerfanas = rows.filter(
      (row) => row.bucketId === null && row.categoria === null,
    );
    let desconocido: { id: string; nombre: string } | null = null;
    if (filasHuerfanas.length > 0) {
      desconocido = await buscarCategoriaDesconocidaDeseos(this.prisma, userId);
      // Counts only — never montos/descripcion/numeroCuenta (ADR-013).
      appLogger.warn(
        'prisma-movimientos-mes: filas con bucketId nulo encontradas al leer (riesgo residual #778 tramo 5a-bis)',
        { userId, filasSinBucket: filasHuerfanas.length },
      );
    }

    return rows.map((row) => {
      const bucket: Bucket = resolverBucket(row.bucketId);
      const categoriaFoldeada = foldCategoria(row.categoria);
      const categoria =
        categoriaFoldeada === null && row.bucketId === null && desconocido
          ? { id: desconocido.id, nombre: desconocido.nombre }
          : categoriaFoldeada;

      return {
        id: row.id,
        fecha: row.fecha,
        descripcion: this.crypto.decrypt(row.descripcion),
        cargo: row.cargo,
        abono: row.abono,
        bucket,
        categoria,
        banco: row.account.banco,
        tipoCuenta: row.account.tipoCuenta,
        numeroCuenta: this.crypto.decrypt(row.account.numeroCuenta),
      };
    });
  }
}
