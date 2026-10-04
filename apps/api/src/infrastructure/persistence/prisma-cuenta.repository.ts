import type { PrismaClient } from '@prisma/client';
import { ICuentaRepository } from '../../application/ports/cuenta-repository.port';

/**
 * PrismaCuentaRepository — borra una cuenta completa en UNA `$transaction`
 * (forma array). Ninguna relación de `User` hace cascade, así que el orden
 * respeta las FKs (el mismo que usó la limpieza demo ya retirada):
 *
 * Session → Transaccion (vía `Account.userId`) → Ingesta (`Transaccion.ingesta`
 * y `Ingesta.account` son Restrict) → PatronClasificacion (FK compuesta a
 * Categoria) → Categoria → Account → User.
 *
 * `BucketPresupuesto` es catálogo global (sin dueño): no se toca. Todo
 * `deleteMany` está acotado por `userId` (RNF-SEC-006) y `deleteMany` no
 * lanza si no hay filas, lo que hace el borrado idempotente. No captura
 * errores de infraestructura: propagan hacia `errorMiddleware` (500) y la
 * transacción no deja un borrado a medias.
 */
export class PrismaCuentaRepository implements ICuentaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async eliminar(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.transaccion.deleteMany({
        where: { account: { userId } },
      }),
      this.prisma.ingesta.deleteMany({ where: { userId } }),
      this.prisma.patronClasificacion.deleteMany({ where: { userId } }),
      this.prisma.categoria.deleteMany({ where: { userId } }),
      this.prisma.account.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);
  }
}
