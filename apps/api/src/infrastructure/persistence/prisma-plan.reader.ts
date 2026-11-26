import type { PrismaClient } from '@prisma/client';

import type { IPlanReader } from '../../application/ports/plan-reader.port';
import type {
  DerechosCuenta,
  EstadoSuscripcion,
  MotivoPermiso,
  TiendaSuscripcion,
} from '../../domain/value-objects/plan';

/**
 * PrismaPlanReader — every query is scoped by `userId` (RNF-SEC-006). The
 * CHECKs in the migration keep `estado`, `tienda` and `motivo` inside their
 * enums.
 */
export class PrismaPlanReader implements IPlanReader {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(userId: string): Promise<DerechosCuenta> {
    const [usuario, suscripcion, permisos] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { creadoEn: true },
      }),
      this.prisma.suscripcion.findUnique({ where: { userId } }),
      this.prisma.permisoPlan.findMany({
        where: { userId },
        orderBy: [{ otorgadoEn: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      cuentaCreadaEn: usuario?.creadoEn ?? null,
      suscripcion:
        suscripcion === null
          ? null
          : {
              estado: suscripcion.estado as EstadoSuscripcion,
              producto: suscripcion.producto,
              tienda: suscripcion.tienda as TiendaSuscripcion,
              venceEn: suscripcion.venceEn,
            },
      permisos: permisos.map((permiso) => ({
        motivo: permiso.motivo as MotivoPermiso,
        otorgadoEn: permiso.otorgadoEn,
        venceEn: permiso.venceEn,
        revocadoEn: permiso.revocadoEn,
      })),
    };
  }

  contarFundadoresVendidos(): Promise<number> {
    return this.prisma.permisoPlan.count({
      where: { motivo: 'fundador', revocadoEn: null, sandbox: false },
    });
  }
}
