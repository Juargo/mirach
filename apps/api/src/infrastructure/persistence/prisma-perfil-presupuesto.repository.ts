import type { PrismaClient } from '@prisma/client';
import type { IPerfilPresupuestoRepository } from '../../application/ports/perfil-presupuesto.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PerfilPresupuesto } from '../../domain/value-objects/perfil-presupuesto';
import { MesFinanciero } from '../../domain/value-objects/mes-financiero';

/**
 * PrismaPerfilPresupuestoRepository — budget profile columns on `User` (#110).
 *
 * Also stores the financial month (#111): cut-off day and declared income.
 *
 * Every query filters by `id: userId` (RNF-SEC-006). The CHECK constraints of
 * the add_perfil_presupuesto migration keep the stored row valid; if a row
 * still fails the domain rules (or the user row is gone), the reader falls
 * back to 50/30/20 (and an invalid financial month to the calendar month)
 * so a summary never fails over the profile.
 */
export class PrismaPerfilPresupuestoRepository implements IPerfilPresupuestoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async obtener(userId: string): Promise<PerfilPresupuesto> {
    const fila = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        perfilPresupuesto: true,
        metaNecesidadesBp: true,
        metaDeseosBp: true,
        metaAhorroBp: true,
        diaCorte: true,
        ingresoDeclarado: true,
      },
    });
    if (fila === null) return PerfilPresupuesto.porDefecto();
    const perfil = PerfilPresupuesto.desdePersistencia(fila.perfilPresupuesto, {
      [Bucket.Necesidades]: BigInt(fila.metaNecesidadesBp),
      [Bucket.Deseos]: BigInt(fila.metaDeseosBp),
      [Bucket.Ahorro]: BigInt(fila.metaAhorroBp),
    });
    const base = perfil.isOk()
      ? perfil.getValue()
      : PerfilPresupuesto.porDefecto();
    const mes = MesFinanciero.crear(fila.diaCorte, fila.ingresoDeclarado);
    return mes.isOk() ? base.conMesFinanciero(mes.getValue()) : base;
  }

  async guardar(userId: string, perfil: PerfilPresupuesto): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        perfilPresupuesto: perfil.perfil,
        metaNecesidadesBp: Number(perfil.metas[Bucket.Necesidades]),
        metaDeseosBp: Number(perfil.metas[Bucket.Deseos]),
        metaAhorroBp: Number(perfil.metas[Bucket.Ahorro]),
        diaCorte: perfil.mesFinanciero.diaCorte.valor,
        ingresoDeclarado: perfil.mesFinanciero.ingresoDeclarado,
      },
    });
  }
}
