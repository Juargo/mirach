import type { PrismaClient } from '@prisma/client';

import type {
  DerechosGuardados,
  IPlanReader,
} from '../../application/ports/plan-reader.port';
import type {
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

  async leer(userId: string): Promise<DerechosGuardados> {
    const [suscripcion, permisos] = await Promise.all([
      this.prisma.suscripcion.findUnique({ where: { userId } }),
      this.prisma.permisoPlan.findMany({
        where: { userId },
        orderBy: [{ otorgadoEn: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
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
}
