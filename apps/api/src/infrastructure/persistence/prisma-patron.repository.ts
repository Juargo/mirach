import { MatchType } from '../../domain/value-objects/patron-clasificacion';
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

  async existePatron(
    userId: string,
    patron: string,
    excluirId?: string,
  ): Promise<boolean> {
    const row = await this.prisma.patronClasificacion.findFirst({
      where: {
        userId,
        patron: { equals: patron, mode: 'insensitive' },
        ...(excluirId !== undefined ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
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
    patch: { patron?: string; matchType?: MatchType; prioridad?: number },
  ): Promise<Patron> {
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
