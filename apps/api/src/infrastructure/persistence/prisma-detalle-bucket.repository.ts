import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../../application/ports/detalle-bucket.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { construirFiltroBucket } from './bucket-ids';
import { foldCategoria } from './fold-categoria';
import { buscarCategoriaDesconocidaDeseos } from './categoria-desconocida-lookup';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { appLogger } from '../logging/app-logger';

/**
 * PrismaDetalleBucketRepository — implementación del port de lectura para el
 * detalle de un bucket (US-017).
 *
 * Implements IDetalleBucketReader. Filtra por userId a través del Account
 * (user isolation estructural en la cláusula WHERE) y por el período con la
 * ventana half-open [desde, hasta), idéntico a PrismaMovimientosMesRepository.
 *
 * Correctness-critical: null-fold (issue #778 tramo 5b) — el filtro DEBE
 * reproducir EXACTAMENTE `construirFiltroBucket` (bucket-ids.ts), la MISMA
 * función que resuelve el fold en memoria de `resolverBucket` (SC-03), o los
 * totales del drill-down no reconciliarán con la tarjeta de resumen. Deseos
 * → `OR: [{bucketId: null}, {bucketId: 'bucket-deseos'}]`; SinCategoria →
 * SOLO `{bucketId: 'bucket-sincategoria'}` (ya no incluye null); cualquier
 * otro bucket → `{bucketId: BUCKET_IDS[bucket]}`.
 *
 * Depende de `PrismaClient` (base), no de `PrismaService` (artefacto Nest) —
 * así el composition root de Express le pasa un cliente plano (ADR-028).
 *
 * Fold categoria → { id, nombre } | null (CATAPI-05, CAT037-06): vía
 * foldCategoria (fold-categoria.ts), que resuelve por `nombre`, no por un id
 * físico fijo — compartido con PrismaMovimientosMesRepository. `icono`
 * (categoria-iconografia CATICO-01/D-04) se selecciona y mapea INLINE, al
 * lado de `foldCategoria`, sin tocar esa función — el fold compartido sigue
 * devolviendo `{id, nombre}` para `PrismaMovimientosMesRepository`, que no
 * necesita el icono (design.md File Changes).
 *
 * Fold Desconocido (issue #778 tramo 5b, decisión del humano): al pedir
 * `Bucket.Deseos`, una fila con `bucketId IS NULL` Y `categoriaId IS NULL`
 * (el riesgo residual de `ProcessIngestaUseCase.revertirYRechazar`) NO cae
 * en el grupo sintético "Sin categoría" — se le asigna la categoría interna
 * `Desconocido` DE Deseos (`buscarCategoriaDesconocidaDeseos`, lazy, UNA
 * query por llamada, solo si aparece al menos una fila así). Si el usuario
 * no tiene su `Desconocido` de Deseos (catálogo incompleto — edge case
 * documentado), degrada a `categoria: null` sin romper la lectura. Una fila
 * `bucketId IS NULL` con `categoriaId` YA asignado (no debería darse — la
 * escritura de categoría siempre re-stampea el bucket atómicamente, ver
 * `ITransaccionBucketWriter`) conserva su categoría real, no se pisa.
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
    const bucketFilter = construirFiltroBucket(bucket);

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
        bucketId: true, // needed to distinguish null-fold rows from real Deseos rows
        categoria: { select: { id: true, nombre: true, icono: true } },
        account: {
          select: {
            banco: true,
            tipoCuenta: true,
            numeroCuenta: true,
          },
        },
      },
      orderBy: [{ cargo: 'desc' }, { fecha: 'asc' }, { id: 'asc' }],
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
        'prisma-detalle-bucket: filas con bucketId nulo encontradas al leer (riesgo residual #778 tramo 5a-bis)',
        { userId, bucket, filasSinBucket: filasHuerfanas.length },
      );
    }

    return rows.map((row) => {
      const categoriaFoldeada = row.categoria
        ? { ...foldCategoria(row.categoria)!, icono: row.categoria.icono }
        : null;
      // Only substitute Desconocido for a TRUE orphan (null bucket AND no
      // categoria) — a row that already carries a real categoria keeps it.
      const categoria =
        categoriaFoldeada === null && row.bucketId === null && desconocido
          ? { id: desconocido.id, nombre: desconocido.nombre, icono: null }
          : categoriaFoldeada;

      return {
        id: row.id,
        fecha: row.fecha,
        descripcion: this.crypto.decrypt(row.descripcion),
        cargo: row.cargo,
        abono: row.abono,
        categoria,
        banco: row.account.banco,
        tipoCuenta: row.account.tipoCuenta,
        numeroCuenta: this.crypto.decrypt(row.account.numeroCuenta),
      };
    });
  }
}
