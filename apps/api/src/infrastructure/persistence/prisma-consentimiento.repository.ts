import { Prisma, type PrismaClient } from '@prisma/client';

import type { IConsentimientoRepository } from '../../application/ports/consentimiento-repository.port';
import {
  type AceptacionTerminos,
  type Consentimiento,
  TipoConsentimiento,
  type VersionConsentimiento,
} from '../../domain/value-objects/consentimiento';

type FilaConsentimiento = {
  tipo: string;
  version: string;
  aceptadoEn: Date;
  revocadoEn: Date | null;
};

/** The `tipo` CHECK in the migration keeps the column inside the enum. */
function aConsentimiento(fila: FilaConsentimiento): Consentimiento {
  return {
    tipo: fila.tipo as TipoConsentimiento,
    version: fila.version,
    aceptadoEn: fila.aceptadoEn,
    revocadoEn: fila.revocadoEn,
  };
}

/**
 * registrarAceptacionTerminos — writes the terms and privacy rows inside the
 * signup transaction (ADR-004 §3, ADR-006 §4). `null` writes nothing.
 */
export async function registrarAceptacionTerminos(
  tx: Prisma.TransactionClient,
  userId: string,
  aceptacion: AceptacionTerminos | null,
): Promise<void> {
  if (aceptacion === null) {
    return;
  }

  await tx.consentimiento.createMany({
    data: [
      {
        userId,
        tipo: TipoConsentimiento.Terminos,
        version: aceptacion.terminos.valor,
      },
      {
        userId,
        tipo: TipoConsentimiento.Privacidad,
        version: aceptacion.privacidad.valor,
      },
    ],
  });
}

/**
 * PrismaConsentimientoRepository — every query is scoped by `userId`
 * (RNF-SEC-006). The partial unique index `Consentimiento_vigente_key` allows
 * one row in force per user and type, so two concurrent acceptances cannot both
 * win: the loser gets P2002 and returns the winner's row.
 */
export class PrismaConsentimientoRepository implements IConsentimientoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tieneVigente(
    userId: string,
    tipo: TipoConsentimiento,
  ): Promise<boolean> {
    const vigentes = await this.prisma.consentimiento.count({
      where: { userId, tipo, revocadoEn: null },
    });

    return vigentes > 0;
  }

  async listar(userId: string): Promise<Consentimiento[]> {
    const filas = await this.prisma.consentimiento.findMany({
      where: { userId },
      orderBy: [{ aceptadoEn: 'desc' }, { id: 'desc' }],
    });

    return filas.map(aConsentimiento);
  }

  async aceptar(
    userId: string,
    tipo: TipoConsentimiento,
    version: VersionConsentimiento,
  ): Promise<Consentimiento> {
    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        const vigente = await tx.consentimiento.findFirst({
          where: { userId, tipo, revocadoEn: null },
        });

        if (vigente?.version === version.valor) {
          return vigente;
        }

        if (vigente !== null) {
          await tx.consentimiento.updateMany({
            where: { id: vigente.id, userId, revocadoEn: null },
            data: { revocadoEn: new Date() },
          });
        }

        return tx.consentimiento.create({
          data: { userId, tipo, version: version.valor },
        });
      });

      return aConsentimiento(fila);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const ganador = await this.prisma.consentimiento.findFirst({
        where: { userId, tipo, revocadoEn: null },
      });

      if (ganador === null) {
        throw error;
      }

      return aConsentimiento(ganador);
    }
  }

  async revocar(userId: string, tipo: TipoConsentimiento): Promise<void> {
    await this.prisma.consentimiento.updateMany({
      where: { userId, tipo, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }
}
