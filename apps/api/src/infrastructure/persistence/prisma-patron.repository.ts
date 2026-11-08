import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import {
  PatronExistente,
  buscarPatronPorTexto,
} from '../../domain/value-objects/patron-existente';
import {
  IPatronRepository,
  Patron,
} from '../../application/ports/patron-repository.port';
import type { PrismaClient } from '@prisma/client';

interface PatronRow {
  id: string;
  categoriaId: string;
  patron: string;
  matchType: string;
  prioridad: number;
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

/**
 * PrismaPatronRepository — implementación del port IPatronRepository
 * (US-038, CAT038-05/07).
 *
 * `userId` en el `WHERE` SQL de TODA consulta y mutación (RNF-SEC-006).
 * `crear` se apoya en la FK compuesta `(categoriaId, userId) →
 * Categoria(id, userId)` (design.md D-04, D-06 de ADR-036) para el rechazo
 * cross-tenant a nivel de BD — el use case YA valida ownership antes (404
 * limpio en vez de un 500 de violación de FK), esta es la segunda barrera
 * estructural, no la primera.
 */
export class PrismaPatronRepository implements IPatronRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorId(userId: string, id: string): Promise<Patron | null> {
    const row = await this.prisma.patronClasificacion.findFirst({
      where: { id, userId },
    });
    return row === null ? null : aPatron(row);
  }

  /**
   * CLA-17: folds case AND accents. SQL `mode: 'insensitive'` folds only
   * case, so the person's patterns are read (`userId` in the WHERE,
   * RNF-SEC-006) and compared in memory with `buscarPatronPorTexto` — the
   * same fold `coincide()` uses. A person holds tens of patterns, not
   * thousands.
   */
  async buscarPorTexto(
    userId: string,
    patron: string,
    excluirId?: string,
  ): Promise<PatronExistente | null> {
    const rows = await this.prisma.patronClasificacion.findMany({
      where: { userId },
      select: {
        id: true,
        patron: true,
        categoria: {
          select: {
            id: true,
            nombre: true,
            bucket: { select: { nombre: true } },
          },
        },
      },
    });
    const row = buscarPatronPorTexto(rows, patron, excluirId);
    if (row === undefined) return null;
    return {
      patronId: row.id,
      categoriaId: row.categoria.id,
      categoria: row.categoria.nombre,
      bucket: row.categoria.bucket.nombre as Bucket,
    };
  }

  async crear(
    userId: string,
    data: {
      categoriaId: string;
      patron: string;
      matchType: MatchType;
      prioridad: number;
    },
  ): Promise<Patron> {
    const row = await this.prisma.patronClasificacion.create({
      data: {
        userId,
        categoriaId: data.categoriaId,
        patron: data.patron,
        matchType: data.matchType,
        prioridad: data.prioridad,
      },
    });
    return aPatron(row);
  }

  async actualizar(
    userId: string,
    id: string,
    patch: {
      patron?: string;
      matchType?: MatchType;
      prioridad?: number;
      categoriaId?: string;
    },
  ): Promise<Patron> {
    // `categoriaId`: the composite FK (categoriaId, userId) → Categoria is
    // the DB-level refusal of another user's category, after the use case's.
    const row = await this.prisma.patronClasificacion.update({
      where: { id, userId },
      data: patch,
    });
    return aPatron(row);
  }

  /** `false` ⇒ el patrón no existe o no pertenece al usuario (anti-enumeration). */
  async eliminar(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.patronClasificacion.deleteMany({
      where: { id, userId },
    });
    return count > 0;
  }
}
