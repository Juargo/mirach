import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../../application/ports/categoria-repository.port';
import { Patron } from '../../application/ports/patron-repository.port';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaEnUsoError } from '../../domain/errors/categoria-en-uso.error';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

const CATEGORIA_INCLUDE = { bucket: true, patrones: true } as const;

/**
 * Rollback sentinel for `eliminar()` (D-06) — an interactive `$transaction`
 * only rolls back when its callback throws, and a `deleteMany()` matching 0
 * rows does not throw on its own. A real `Error` subclass (not a bare
 * value) so `throw`ing it satisfies `@typescript-eslint/only-throw-error`;
 * identity-checked (`instanceof`), never surfaced to a caller.
 */
class RollbackCategoriaEnUso extends Error {}

interface PatronRow {
  id: string;
  categoriaId: string;
  patron: string;
  matchType: string;
  prioridad: number;
}

interface CategoriaRow {
  id: string;
  nombre: string;
  bucket: { nombre: string };
  patrones: PatronRow[];
}

/** Mismo tiebreak (prioridad, patron, id) de CategorizarTransaccionUseCase
 * (D-08) — dos representaciones de la misma regla, cross-referenciadas a
 * propósito en lugar de compartir una abstracción (design.md D-08). */
function ordenarPatrones(patrones: PatronRow[]): PatronRow[] {
  return [...patrones].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    if (a.patron !== b.patron) return a.patron < b.patron ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function aPatron(row: PatronRow): Patron {
  return {
    id: row.id,
    categoriaId: row.categoriaId,
    patron: row.patron,
    matchType: row.matchType as MatchType,
    prioridad: row.prioridad,
  };
}

function aCategoriaConPatrones(row: CategoriaRow): CategoriaConPatrones {
  return {
    id: row.id,
    nombre: row.nombre,
    bucket: row.bucket.nombre as Bucket,
    patrones: ordenarPatrones(row.patrones).map(aPatron),
  };
}

/**
 * PrismaCategoriaRepository — implementación del port ICategoriaRepository
 * (US-038, CAT038-01…04/07).
 *
 * `userId` en el `WHERE` SQL de TODA consulta y mutación — nunca un filtro
 * en memoria (RNF-SEC-006).
 *
 * `eliminar` — BINDING, no regresar a check-then-delete (D-06): el predicado
 * "en uso" vive DENTRO del propio statement de borrado
 * (`transacciones: { none: {} }`, que compila a un `NOT EXISTS` evaluado
 * atómicamente con el DELETE). Un `$transaction` envolviendo un count
 * separado NO cierra la carrera bajo READ COMMITTED — una fila comprometida
 * por un writer concurrente entre el count y el delete sigue siendo visible
 * para la acción FK del delete. El `$transaction` interactivo existe por
 * una razón DISTINTA: que "borrar los patrones, luego la categoría" sea
 * todo-o-nada, para que un rechazo nunca le cueste al usuario sus patrones.
 * Ambas razones deben sostenerse a la vez. El filtro `transacciones: { none: {} }`
 * es deliberadamente NO acotado por usuario: cualquier `Transaccion` que
 * apunte a la categoría — incluso una fila cross-tenant hipotética —
 * bloquea el borrado; rechazar es el lado seguro.
 */
export class PrismaCategoriaRepository implements ICategoriaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarConPatrones(userId: string): Promise<CategoriaConPatrones[]> {
    const rows = await this.prisma.categoria.findMany({
      where: { userId },
      include: CATEGORIA_INCLUDE,
      orderBy: { nombre: 'asc' },
    });
    return (rows as unknown as CategoriaRow[]).map(aCategoriaConPatrones);
  }

  async buscarPorId(
    userId: string,
    id: string,
  ): Promise<CategoriaConPatrones | null> {
    const row = await this.prisma.categoria.findFirst({
      where: { id, userId },
      include: CATEGORIA_INCLUDE,
    });
    return row === null ? null : aCategoriaConPatrones(row);
  }

  async existeNombre(
    userId: string,
    nombre: string,
    excluirId?: string,
  ): Promise<boolean> {
    const row = await this.prisma.categoria.findFirst({
      where: {
        userId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId !== undefined ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async crear(
    userId: string,
    data: { nombre: string; bucket: string },
  ): Promise<CategoriaConPatrones> {
    const row = await this.prisma.categoria.create({
      data: {
        userId,
        nombre: data.nombre,
        bucketId: BUCKET_IDS[data.bucket as Bucket],
      },
      include: CATEGORIA_INCLUDE,
    });
    return aCategoriaConPatrones(row);
  }

  async actualizar(
    userId: string,
    id: string,
    patch: { nombre?: string; bucket?: string },
  ): Promise<CategoriaConPatrones> {
    const data: { nombre?: string; bucketId?: string } = {};
    if (patch.nombre !== undefined) {
      data.nombre = patch.nombre;
    }
    if (patch.bucket !== undefined) {
      data.bucketId = BUCKET_IDS[patch.bucket as Bucket];
    }

    const updateCategoria = this.prisma.categoria.update({
      where: { id, userId },
      data,
      include: CATEGORIA_INCLUDE,
    });

    // `bucket` ausente del patch ⇒ el bucket no cambió, sin re-stamp (D-07).
    if (patch.bucket === undefined) {
      const row = await updateCategoria;
      return aCategoriaConPatrones(row);
    }

    // `bucket` presente ⇒ re-stamp DENTRO de la MISMA transacción, array
    // form (los dos statements no tienen lecturas interdependientes, D-07).
    const restamp = this.prisma.transaccion.updateMany({
      where: { categoriaId: id, account: { userId } }, // RNF-SEC-006 en SQL
      data: { bucketId: data.bucketId },
    });

    const [row] = await this.prisma.$transaction([updateCategoria, restamp]);
    return aCategoriaConPatrones(row);
  }

  async eliminar(
    userId: string,
    id: string,
  ): Promise<Result<void, CategoriaNoEncontradaError | CategoriaEnUsoError>> {
    let eliminadas = 0;
    try {
      eliminadas = await this.prisma.$transaction(async (tx) => {
        // Los patrones cascadean junto con la categoría — todo-o-nada.
        await tx.patronClasificacion.deleteMany({
          where: { categoriaId: id, userId },
        });
        // Predicado "en uso" DENTRO del propio DELETE (D-06 — ver docblock).
        const { count } = await tx.categoria.deleteMany({
          where: { id, userId, transacciones: { none: {} } },
        });
        if (count === 0) {
          throw new RollbackCategoriaEnUso();
        }
        return count;
      });
    } catch (error) {
      if (!(error instanceof RollbackCategoriaEnUso)) {
        throw error;
      }
      eliminadas = 0;
    }

    if (eliminadas > 0) {
      return Result.ok(undefined);
    }

    // count === 0: distinguir 404 (ausente/no es del usuario) de 409 (en uso)
    // con un lookup FUERA de la transacción — la categoría ya sobrevivió.
    const fila = await this.prisma.categoria.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (fila === null) {
      return Result.fail(new CategoriaNoEncontradaError(id));
    }
    return Result.fail(new CategoriaEnUsoError(id));
  }
}
