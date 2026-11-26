import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CambioDerechosAplicable,
  IDerechosPlusWriter,
  ResultadoCambioDerechos,
} from '../../application/ports/derechos-plus-writer.port';
import {
  EstadoSuscripcion,
  MotivoPermiso,
  suscripcionVigente,
  type Suscripcion,
} from '../../domain/value-objects/plan';

type Tx = Prisma.TransactionClient;

const FUNDADOR = MotivoPermiso.Fundador;

/**
 * PrismaDerechosPlusWriter — applies one store event to the stored Plus
 * entitlements (ADR-012 §1, ADR-015 §5).
 *
 * Everything runs in one transaction: the `User` rows involved are locked in id
 * order (two events for the same account cannot interleave, and neither can an
 * event and an account merge, which takes the same locks), the event id is
 * recorded, and the change is written. A failure rolls all of it back, so the
 * provider's retry starts clean.
 *
 * Events can arrive late: a change older than what is stored is `obsoleto` and
 * writes nothing but its id. Every query is scoped by a `userId` that came out
 * of the locked rows (RNF-SEC-006).
 */
export class PrismaDerechosPlusWriter implements IDerechosPlusWriter {
  constructor(private readonly prisma: PrismaClient) {}

  aplicar(
    eventoId: string,
    cambio: CambioDerechosAplicable,
  ): Promise<ResultadoCambioDerechos> {
    return this.prisma.$transaction(async (tx) => {
      if (cambio.tipo === 'transferencia') {
        return this.transferir(tx, eventoId, cambio);
      }

      const [userId] = await this.bloquearExistentes(tx, cambio.usuarios);
      if (userId === undefined) {
        return 'usuario_desconocido';
      }
      if (!(await this.registrarEvento(tx, eventoId))) {
        return 'duplicado';
      }
      if (cambio.tipo === 'suscripcion') {
        return this.guardarSuscripcion(
          tx,
          userId,
          cambio.suscripcion,
          cambio.ocurridoEn,
        );
      }
      return cambio.tipo === 'fundador_otorgado'
        ? this.otorgarFundador(tx, userId, cambio.ocurridoEn, cambio.sandbox)
        : this.revocarFundador(tx, userId, cambio.ocurridoEn);
    });
  }

  /**
   * Locks the `User` rows that exist among `ids`, in id order, and returns the
   * ones found in the order `ids` gave them.
   */
  private async bloquearExistentes(
    tx: Tx,
    ids: readonly string[],
  ): Promise<string[]> {
    const existentes = new Set<string>();
    for (const id of [...new Set(ids)].sort()) {
      const filas = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`,
      );
      if (filas.length === 1) {
        existentes.add(id);
      }
    }
    return ids.filter((id) => existentes.has(id));
  }

  /** `false` when the event had already been processed. */
  private async registrarEvento(tx: Tx, eventoId: string): Promise<boolean> {
    const { count } = await tx.eventoSuscripcionProcesado.createMany({
      data: [{ id: eventoId }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private async guardarSuscripcion(
    tx: Tx,
    userId: string,
    suscripcion: Suscripcion,
    ocurridoEn: Date,
  ): Promise<ResultadoCambioDerechos> {
    const actual = await tx.suscripcion.findUnique({
      where: { userId },
      select: { ultimoEventoEn: true },
    });
    if (actual !== null && actual.ultimoEventoEn > ocurridoEn) {
      return 'obsoleto';
    }

    const datos = {
      producto: suscripcion.producto,
      estado: suscripcion.estado,
      tienda: suscripcion.tienda,
      venceEn: suscripcion.venceEn,
      ultimoEventoEn: ocurridoEn,
    };
    await tx.suscripcion.upsert({
      where: { userId },
      create: { userId, ...datos },
      update: datos,
    });
    return 'aplicado';
  }

  private async otorgarFundador(
    tx: Tx,
    userId: string,
    ocurridoEn: Date,
    sandbox: boolean,
  ): Promise<ResultadoCambioDerechos> {
    const where = { userId_motivo: { userId, motivo: FUNDADOR } };
    const actual = await tx.permisoPlan.findUnique({ where });
    // A purchase older than its own refund must not bring the grant back.
    if (actual?.revocadoEn != null && actual.revocadoEn > ocurridoEn) {
      return 'obsoleto';
    }
    if (actual !== null && actual.revocadoEn === null) {
      return 'aplicado';
    }

    const datos = {
      otorgadoEn: ocurridoEn,
      venceEn: null,
      revocadoEn: null,
      sandbox,
    };
    await tx.permisoPlan.upsert({
      where,
      create: { userId, motivo: FUNDADOR, ...datos },
      update: datos,
    });
    return 'aplicado';
  }

  /**
   * A refund with no grant stored still leaves a revoked row: if its purchase
   * arrives later, it is recognised as older and ignored.
   */
  private async revocarFundador(
    tx: Tx,
    userId: string,
    ocurridoEn: Date,
  ): Promise<ResultadoCambioDerechos> {
    const where = { userId_motivo: { userId, motivo: FUNDADOR } };
    const actual = await tx.permisoPlan.findUnique({ where });
    if (actual !== null && actual.otorgadoEn > ocurridoEn) {
      return 'obsoleto';
    }
    if (actual?.revocadoEn != null) {
      return 'aplicado';
    }

    await tx.permisoPlan.upsert({
      where,
      create: {
        userId,
        motivo: FUNDADOR,
        otorgadoEn: ocurridoEn,
        revocadoEn: ocurridoEn,
      },
      update: { revocadoEn: ocurridoEn },
    });
    return 'aplicado';
  }

  /**
   * The store moved the purchases to another account (restore purchases,
   * PLA-05). Only what was bought moves: the subscription and the Fundador
   * grant. The trial and a tester's lifetime grant belong to the account
   * (ADR-015 §3 and §4). The origin always ends without them; the destination
   * keeps its own when it already has one.
   */
  private async transferir(
    tx: Tx,
    eventoId: string,
    cambio: Extract<CambioDerechosAplicable, { tipo: 'transferencia' }>,
  ): Promise<ResultadoCambioDerechos> {
    const existentes = await this.bloquearExistentes(tx, [
      ...cambio.hacia,
      ...cambio.desde,
    ]);
    const destino = cambio.hacia.find((id) => existentes.includes(id));
    const origenes = cambio.desde.filter(
      (id) => id !== destino && existentes.includes(id),
    );
    if (destino === undefined || origenes.length === 0) {
      return 'usuario_desconocido';
    }
    if (!(await this.registrarEvento(tx, eventoId))) {
      return 'duplicado';
    }

    for (const origen of origenes) {
      await this.moverSuscripcion(tx, origen, destino, cambio.ocurridoEn);
      await this.moverFundador(tx, origen, destino, cambio.ocurridoEn);
    }
    return 'aplicado';
  }

  private async moverSuscripcion(
    tx: Tx,
    origen: string,
    destino: string,
    ocurridoEn: Date,
  ): Promise<void> {
    const delOrigen = await tx.suscripcion.findUnique({
      where: { userId: origen },
    });
    if (delOrigen === null) {
      return;
    }
    const delDestino = await tx.suscripcion.findUnique({
      where: { userId: destino },
    });
    const destinoVigente =
      delDestino !== null &&
      suscripcionVigente(
        {
          estado: delDestino.estado as EstadoSuscripcion,
          venceEn: delDestino.venceEn,
        },
        ocurridoEn,
      );

    if (destinoVigente) {
      await tx.suscripcion.update({
        where: { userId: origen },
        data: {
          estado: EstadoSuscripcion.Vencida,
          venceEn: ocurridoEn,
          ultimoEventoEn: ocurridoEn,
        },
      });
      return;
    }
    // A destination row that no longer gives access makes room for the moved one.
    await tx.suscripcion.deleteMany({ where: { userId: destino } });
    await tx.suscripcion.update({
      where: { userId: origen },
      data: { userId: destino, ultimoEventoEn: ocurridoEn },
    });
  }

  private async moverFundador(
    tx: Tx,
    origen: string,
    destino: string,
    ocurridoEn: Date,
  ): Promise<void> {
    const vigenteDelOrigen = await tx.permisoPlan.count({
      where: { userId: origen, motivo: FUNDADOR, revocadoEn: null },
    });
    if (vigenteDelOrigen === 0) {
      return;
    }
    const delDestino = await tx.permisoPlan.findUnique({
      where: { userId_motivo: { userId: destino, motivo: FUNDADOR } },
    });

    if (delDestino === null) {
      await tx.permisoPlan.updateMany({
        where: { userId: origen, motivo: FUNDADOR },
        data: { userId: destino },
      });
      return;
    }
    // One row per user and reason: the destination's own row takes the grant.
    if (delDestino.revocadoEn !== null) {
      await tx.permisoPlan.updateMany({
        where: { userId: destino, motivo: FUNDADOR },
        data: { otorgadoEn: ocurridoEn, revocadoEn: null },
      });
    }
    await tx.permisoPlan.updateMany({
      where: { userId: origen, motivo: FUNDADOR },
      data: { revocadoEn: ocurridoEn },
    });
  }
}
