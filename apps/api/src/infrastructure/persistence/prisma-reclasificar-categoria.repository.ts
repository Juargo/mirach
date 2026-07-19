import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../../application/ports/reclasificar-categoria.port';
import { PrismaService } from './prisma.service';
import { BUCKET_IDS } from './bucket-ids';
import { CATEGORIA_IDS } from './categoria-ids';

/**
 * PrismaReclasificarCategoriaRepository — implementación del port
 * IReclasificarCategoriaWriter (US-013 S4, CATAPI-01/03/04).
 *
 * `updateMany` con `WHERE { id, account: { userId } }` es el aislamiento
 * ESTRUCTURAL por userId (RNF-SEC-006) — mismo patrón que todo repo de
 * lectura existente (prisma-movimientos-mes, prisma-resumen-mes,
 * prisma-detalle-bucket). `count === 0` fusiona "no existe" y "no es del
 * usuario" en un único TransaccionNoEncontradaError (anti-enumeration) —
 * nunca se distinguen los dos casos.
 *
 * `categoriaId` + `bucketId` se escriben ATÓMICAMENTE en la misma llamada
 * `updateMany` — el bucket ya viene derivado por el use case (nunca se
 * recalcula aquí), así el caché denormalizado nunca puede quedar
 * desincronizado de la categoría (design.md §2).
 */
export class PrismaReclasificarCategoriaRepository implements IReclasificarCategoriaWriter {
  constructor(private readonly prisma: PrismaService) {}

  async reasignar(
    userId: string,
    transaccionId: string,
    categoria: Categoria,
    bucket: Bucket,
  ): Promise<Result<ReclasificarCategoriaResult, TransaccionNoEncontradaError>> {
    const { count } = await this.prisma.transaccion.updateMany({
      where: { id: transaccionId, account: { userId } }, // STRUCTURAL isolation (RNF-SEC-006)
      data: {
        categoriaId: CATEGORIA_IDS[categoria],
        bucketId: BUCKET_IDS[bucket],
      },
    });

    if (count === 0) {
      // Not found OR not owned — merged, indistinguishable (anti-enumeration).
      return Result.fail(new TransaccionNoEncontradaError(transaccionId));
    }

    return Result.ok({ id: transaccionId, categoria, bucket });
  }
}
