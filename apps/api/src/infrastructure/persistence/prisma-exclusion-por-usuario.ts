import { Prisma, type PrismaClient } from '@prisma/client';

import type { IExclusionPorUsuario } from '../../application/ports/exclusion-por-usuario.port';

/** The action is short (one read and one write); this only bounds a stuck one. */
const OPCIONES = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * PrismaExclusionPorUsuario — holds a row lock on the `User` for as long as
 * the action runs, so a second caller for the same user waits its turn, across
 * API instances too.
 *
 * The action runs on its own connections, outside this transaction, so the
 * lock is `FOR NO KEY UPDATE`: it excludes another holder of the same lock but
 * not the `FOR KEY SHARE` a row that references the user takes on insert. With
 * `FOR UPDATE` the action's own insert of an `Account` would wait for this
 * transaction, which waits for the action.
 */
export class PrismaExclusionPorUsuario implements IExclusionPorUsuario {
  constructor(private readonly prisma: PrismaClient) {}

  enExclusiva<T>(userId: string, accion: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`,
      );
      return accion();
    }, OPCIONES);
  }
}
