import { Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IReloj } from '../../../application/ports/reloj.port';
import { TTL_SESION_MS } from '../../../domain/value-objects/duracion-sesion';
import { PrismaService } from '../../persistence/prisma.service';

/**
 * DemoCleanupService — borra usuarios demo expirados (demo-cleanup.md).
 *
 * "Expirado" = `demoCreatedAt` más viejo que 7 días (DEMO-CLN-01) — reusa
 * `TTL_SESION_MS` (duracion-sesion.ts) por DRY, ya que ambos TTLs son de 7
 * días por diseño, no una coincidencia que deba duplicarse.
 *
 * Se invoca de dos formas (design.md — "cleanup dual"):
 *   - Lazy: `AuthController.demo()` llama `borrarExpirados()` ANTES de crear
 *     cada usuario demo nuevo (DEMO-CLN-02).
 *   - Cron: `limpiarDiario()` corre a las 3:00 AM todos los días como red de
 *     seguridad (DEMO-CLN-03), vía `@nestjs/schedule`.
 *
 * No es un port — es un servicio de infraestructura concreto (design.md
 * "DemoCleanupService — infra service, no port needed"), igual que
 * `SystemReloj`: no hay una abstracción de dominio que ganar aislando esto
 * detrás de una interfaz (YAGNI).
 */
export class DemoCleanupService {
  private readonly logger = new Logger(DemoCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
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

  /** DEMO-CLN-03 — red de seguridad diaria, 3:00 AM. Nunca lanza ni bloquea el arranque. */
  @Cron('0 3 * * *')
  async limpiarDiario(): Promise<void> {
    try {
      const count = await this.borrarExpirados();
      this.logger.log(
        count === 0 ? '0 expired demo accounts cleaned' : `${count} expired demo accounts cleaned`,
      );
    } catch (err) {
      this.logger.error(
        'Error inesperado durante la limpieza diaria de cuentas demo',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
