import type { Prisma, PrismaClient } from '@prisma/client';
import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import {
  AprendizajeClasificacionWriterError,
  CambiosAprendizaje,
  IAprendizajeClasificacionWriter,
  ResultadoAprendizaje,
} from '../../application/ports/aprendizaje-clasificacion-writer.port';
import { Patron } from '../../application/ports/patron-repository.port';

/** Carries a business failure out of the interactive transaction so Prisma
 * rolls it back; caught right below and turned into `Result.fail`. */
class Rechazo extends Error {
  constructor(readonly causa: AprendizajeClasificacionWriterError) {
    super(causa.message);
  }
}

/**
 * PrismaAprendizajeClasificacionWriter — `IAprendizajeClasificacionWriter`
 * over ONE interactive `$transaction` (ADR-004:49, CLA-15).
 *
 * Order inside the transaction: resolve the target category by
 * `(id, userId)` (its `bucketId` is the bucket the rows get) → manual
 * reclassification, if any → pattern (create / move / keep) → move the
 * coinciding rows. `Transaccion.categoriaId` has a plain FK to `Categoria.id`,
 * so the `(id, userId)` lookup is what keeps a row from pointing at another
 * person's category. Every WHERE carries `userId` (RNF-SEC-006).
 *
 * The coinciding ids were selected before the transaction; the move's WHERE
 * repeats `clasificacionManual = false`, so a row reclassified by hand in
 * between is never overwritten (CLA-16). `movidos` is Prisma's count.
 */
export class PrismaAprendizajeClasificacionWriter implements IAprendizajeClasificacionWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async aplicar(
    userId: string,
    cambios: CambiosAprendizaje,
  ): Promise<
    Result<ResultadoAprendizaje, AprendizajeClasificacionWriterError>
  > {
    try {
      const resultado = await this.prisma.$transaction((tx) =>
        this.enTransaccion(tx, userId, cambios),
      );
      return Result.ok(resultado);
    } catch (error) {
      if (error instanceof Rechazo) return Result.fail(error.causa);
      throw error;
    }
  }

  private async enTransaccion(
    tx: Prisma.TransactionClient,
    userId: string,
    cambios: CambiosAprendizaje,
  ): Promise<ResultadoAprendizaje> {
    const categoria = await tx.categoria.findFirst({
      where: { id: cambios.categoriaId, userId },
      select: {
        id: true,
        nombre: true,
        bucketId: true,
        bucket: { select: { nombre: true } },
      },
    });
    if (categoria === null) {
      throw new Rechazo(new CategoriaDesconocidaError(cambios.categoriaId));
    }

    if (cambios.reclasificarTransaccionId !== undefined) {
      const { count } = await tx.transaccion.updateMany({
        where: { id: cambios.reclasificarTransaccionId, account: { userId } },
        data: {
          categoriaId: categoria.id,
          bucketId: categoria.bucketId,
          // CLA-16: a manual reclassification is never moved by a pattern.
          clasificacionManual: true,
        },
      });
      if (count === 0) {
        throw new Rechazo(
          new TransaccionNoEncontradaError(cambios.reclasificarTransaccionId),
        );
      }
    }

    const patron = await this.escribirPatron(tx, userId, categoria.id, cambios);

    let movidos = 0;
    if (cambios.moverTransaccionIds.length > 0) {
      const { count } = await tx.transaccion.updateMany({
        where: {
          id: { in: [...cambios.moverTransaccionIds] },
          account: { userId },
          clasificacionManual: false,
        },
        data: { categoriaId: categoria.id, bucketId: categoria.bucketId },
      });
      movidos = count;
    }

    return {
      patron,
      categoria: {
        id: categoria.id,
        nombre: categoria.nombre,
        bucket: categoria.bucket.nombre as Bucket,
      },
      movidos,
    };
  }

  private async escribirPatron(
    tx: Prisma.TransactionClient,
    userId: string,
    categoriaId: string,
    cambios: CambiosAprendizaje,
  ): Promise<Patron> {
    const accion = cambios.patron;
    if (accion.tipo === 'crear') {
      const row = await tx.patronClasificacion.create({
        data: {
          userId,
          categoriaId,
          patron: accion.patron,
          matchType: accion.matchType,
          prioridad: accion.prioridad,
        },
      });
      return aPatron(row);
    }

    if (accion.tipo === 'mover') {
      // Only the category changes: id and `creadoEn` stay (CLA-12 tie-break).
      const { count } = await tx.patronClasificacion.updateMany({
        where: { id: accion.patronId, userId },
        data: { categoriaId },
      });
      if (count === 0) {
        throw new Rechazo(new PatronNoEncontradoError(accion.patronId));
      }
    }

    const row = await tx.patronClasificacion.findFirst({
      where: { id: accion.patronId, userId },
    });
    if (row === null) {
      throw new Rechazo(new PatronNoEncontradoError(accion.patronId));
    }
    return aPatron(row);
  }
}

function aPatron(row: {
  id: string;
  categoriaId: string;
  patron: string;
  matchType: string;
  prioridad: number;
}): Patron {
  return {
    id: row.id,
    categoriaId: row.categoriaId,
    patron: row.patron,
    matchType: row.matchType as MatchType,
    prioridad: row.prioridad,
  };
}
