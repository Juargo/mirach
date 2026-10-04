import { Prisma, type PrismaClient } from '@prisma/client';

import {
  IIdentidadAppleRepository,
  NuevoUsuarioApple,
  UsuarioApple,
} from '../../application/ports/identidad-apple-repository.port';
import { Email } from '../../domain/value-objects/email';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { copiarCatalogoTemplate } from './catalogo-template';
import { esCarreraDeCreacionUser } from './user-creation-race';

const COLUMNAS_CARRERA = ['emailBlindIndex', 'appleSub'] as const;

/**
 * PrismaIdentidadAppleRepository — implementación de `IIdentidadAppleRepository`.
 * Mismas garantías que `PrismaIdentidadGoogleRepository`:
 *
 * - `buscarPorEmail` consulta por `emailBlindIndex` (ADR-013); el composition
 *   root inyecta la MISMA instancia de `IBlindIndexService` del resto del
 *   grafo de auth.
 * - `vincularAppleSub` es un `updateMany` CONDICIONAL (`appleSub IS NULL`),
 *   nunca read-modify-write; P2002 resuelve a `false`.
 * - `crearDesdeApple` crea User + catálogo en UNA transacción (invariante
 *   ADR-036: nunca un usuario sin catálogo); P2002 sobre `emailBlindIndex` o
 *   `appleSub` → `null` (carrera de creación perdida).
 */
export class PrismaIdentidadAppleRepository implements IIdentidadAppleRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blindIndex: IBlindIndexService,
    private readonly crypto: ICryptoService,
  ) {}

  async buscarPorAppleSub(appleSub: string): Promise<UsuarioApple | null> {
    const user = await this.prisma.user.findUnique({
      where: { appleSub },
      select: { id: true, appleSub: true },
    });

    return user === null ? null : { userId: user.id, appleSub: user.appleSub };
  }

  async buscarPorEmail(email: Email): Promise<UsuarioApple | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailBlindIndex: this.blindIndex.compute(email.valor) },
      select: { id: true, appleSub: true },
    });

    return user === null ? null : { userId: user.id, appleSub: user.appleSub };
  }

  async vincularAppleSub(userId: string, appleSub: string): Promise<boolean> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, appleSub: null },
        data: { appleSub },
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

  async crearDesdeApple(datos: NuevoUsuarioApple): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            nombre: datos.nombre,
            email: this.crypto.encrypt(datos.email.valor),
            emailBlindIndex: this.blindIndex.compute(datos.email.valor),
            appleSub: datos.appleSub,
          },
        });

        await copiarCatalogoTemplate(tx, user.id);

        return user.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        esCarreraDeCreacionUser(error, COLUMNAS_CARRERA)
      ) {
        return null;
      }
      throw error;
    }
  }
}
