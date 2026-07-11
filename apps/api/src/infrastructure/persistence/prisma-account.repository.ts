import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import {
  DetectedBank,
} from '../../application/ports/bank-detector.port';
import { IAccountRepository } from '../../application/ports/account-repository.port';
import { PrismaService } from './prisma.service';

/**
 * PrismaAccountRepository — implementación Prisma del upsert idempotente de
 * Account por la clave natural (userId, banco, tipoCuenta, numeroCuenta).
 *
 * `ensure` es idempotente: si la cuenta ya existe devuelve su id sin duplicar.
 * Convierte errores de infraestructura en Result.fail(PersistenciaFallidaError).
 */
export class PrismaAccountRepository implements IAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(
    userId: string,
    banco: DetectedBank,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>> {
    try {
      const account = await this.prisma.account.upsert({
        where: {
          userId_banco_tipoCuenta_numeroCuenta: {
            userId,
            banco: banco.banco,
            tipoCuenta: banco.tipoCuenta,
            numeroCuenta: banco.numeroCuenta,
          },
        },
        create: {
          userId,
          banco: banco.banco,
          tipoCuenta: banco.tipoCuenta,
          numeroCuenta: banco.numeroCuenta,
        },
        update: {},
      });
      return Result.ok({ accountId: account.id });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo asegurar la cuenta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
