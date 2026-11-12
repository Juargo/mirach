import { Prisma, type PrismaClient } from '@prisma/client';

import {
  ICuentaAnonimaRepository,
  ProveedorIdentidad,
  VinculacionDeIdentidad,
} from '../../application/ports/cuenta-anonima-repository.port';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { AceptacionTerminos } from '../../domain/value-objects/consentimiento';
import { Email } from '../../domain/value-objects/email';
import { copiarCatalogoTemplate } from './catalogo-template';
import { registrarAceptacionTerminos } from './prisma-consentimiento.repository';

const NOMBRE_POR_DEFECTO = 'Usuario';

/** Una cuenta es anónima cuando no tiene NINGUNA credencial (ADR-013). */
const SIN_CREDENCIALES = {
  appleSub: null,
  googleSub: null,
  passwordHash: null,
} as const;

const COLUMNA_SUB: Record<ProveedorIdentidad, 'appleSub' | 'googleSub'> = {
  apple: 'appleSub',
  google: 'googleSub',
};

/**
 * PrismaCuentaAnonimaRepository — implementación de `ICuentaAnonimaRepository`.
 *
 * - `crear` usa las mismas piezas que el alta con Apple o Google: User +
 *   catálogo + términos en UNA transacción (nunca un usuario sin catálogo).
 * - `vincular` es un `updateMany` CONDICIONAL sobre `SIN_CREDENCIALES`, nunca
 *   read-modify-write: dos vinculaciones concurrentes no pueden aplicar ambas.
 *   El email va cifrado con su blind index (ADR-009).
 */
export class PrismaCuentaAnonimaRepository implements ICuentaAnonimaRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blindIndex: IBlindIndexService,
    private readonly crypto: ICryptoService,
  ) {}

  async crear(aceptacion: AceptacionTerminos | null): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { nombre: NOMBRE_POR_DEFECTO },
      });

      await copiarCatalogoTemplate(tx, user.id);
      await registrarAceptacionTerminos(tx, user.id, aceptacion);

      return user.id;
    });
  }

  async esAnonima(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appleSub: true, googleSub: true, passwordHash: true },
    });

    return (
      user !== null &&
      user.appleSub === null &&
      user.googleSub === null &&
      user.passwordHash === null
    );
  }

  async existeIdentidad(
    proveedor: ProveedorIdentidad,
    sub: string,
  ): Promise<boolean> {
    const where =
      proveedor === 'apple' ? { appleSub: sub } : { googleSub: sub };

    return (await this.prisma.user.count({ where })) > 0;
  }

  async existeEmailEnOtraCuenta(
    email: Email,
    userId: string,
  ): Promise<boolean> {
    const total = await this.prisma.user.count({
      where: {
        emailBlindIndex: this.blindIndex.compute(email.valor),
        NOT: { id: userId },
      },
    });

    return total > 0;
  }

  async vincular(datos: VinculacionDeIdentidad): Promise<boolean> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { id: datos.userId, ...SIN_CREDENCIALES },
        data: {
          [COLUMNA_SUB[datos.proveedor]]: datos.sub,
          ...(datos.email !== null && {
            email: this.crypto.encrypt(datos.email.valor),
            emailBlindIndex: this.blindIndex.compute(datos.email.valor),
          }),
          ...(datos.nombre !== null && { nombre: datos.nombre }),
        },
      });

      return count === 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
