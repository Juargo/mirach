import { IReloj } from '../../../application/ports/reloj.port';
import { TTL_SESION_MS } from '../../../domain/value-objects/duracion-sesion';
import type { PrismaClient } from '@prisma/client';

/**
 * DemoCleanupService — borra usuarios demo expirados (demo-cleanup.md).
 *
 * "Expirado" = `demoCreatedAt` más viejo que 7 días (DEMO-CLN-01) — reusa
 * `TTL_SESION_MS` (duracion-sesion.ts) por DRY, ya que ambos TTLs son de 7
 * días por diseño, no una coincidencia que deba duplicarse.
 *
 * Se invoca de dos formas (design.md — "cleanup dual"):
 *   - Lazy: la ruta `GET /api/auth/demo` llama `borrarExpirados()` ANTES de
 *     crear cada usuario demo nuevo (DEMO-CLN-02).
 *   - Diaria: `limpiarDiario()` es la red de seguridad (DEMO-CLN-03).
 *
 * NOTA (ADR-028): antes se agendaba con un cron del framework. Tras el cutover
 * a Express, `limpiarDiario()` la agenda `programarLimpiezaDemo` (node-cron) en
 * el bootstrap (server.ts). La limpieza lazy en la ruta demo también corre.
 *
 * No es un port — es un servicio de infraestructura concreto (design.md
 * "DemoCleanupService — infra service, no port needed"), igual que
 * `SystemReloj`: no hay una abstracción de dominio que ganar aislando esto
 * detrás de una interfaz (YAGNI).
 */
export class DemoCleanupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: IReloj,
  ) {}

  /**
   * Borra todos los usuarios demo cuyo `demoCreatedAt` supera el TTL,
   * en cascada Session → Transaccion → Ingesta → Account → User, dentro de
   * una única transacción (DEMO-CLN-01). Retorna la cantidad de usuarios
   * borrados (0 si no había ninguno expirado).
   */
  async borrarExpirados(): Promise<number> {
    const cutoff = new Date(this.reloj.ahora().getTime() - TTL_SESION_MS);

    const demos = await this.prisma.user.findMany({
      where: { esDemo: true, demoCreatedAt: { lt: cutoff } },
      select: { id: true },
    });

    if (demos.length === 0) {
      return 0;
    }

    const ids = demos.map((u) => u.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: { in: ids } } });
      await tx.transaccion.deleteMany({ where: { account: { userId: { in: ids } } } });
      await tx.ingesta.deleteMany({ where: { account: { userId: { in: ids } } } });
      await tx.account.deleteMany({ where: { userId: { in: ids } } });
      const { count } = await tx.user.deleteMany({ where: { id: { in: ids } } });
      return count;
    });
  }

  /** DEMO-CLN-03 — red de seguridad diaria. Nunca lanza. Falta agendarla (ver nota de clase). */
  async limpiarDiario(): Promise<void> {
    try {
      const count = await this.borrarExpirados();
      console.log(
        count === 0 ? '0 expired demo accounts cleaned' : `${count} expired demo accounts cleaned`,
      );
    } catch (err) {
      console.error(
        'Error inesperado durante la limpieza diaria de cuentas demo',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
