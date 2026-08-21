import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { DetectedBank } from '../../application/ports/bank-detector.port';
import { IAccountReader } from '../../application/ports/account-reader.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import { normalizeNumeroCuenta } from './normalize-numero-cuenta';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaAccountReader — implementación Prisma del port de solo-lectura IAccountReader.
 *
 * US-057 D-05: busca la Account del usuario para el banco detectado usando el
 * MISMO blind index que PrismaAccountRepository.ensure() — computa
 * normalizeNumeroCuenta(numeroCuenta) + blindIndex.compute(normalizado) para
 * encontrar la clave natural compuesta.
 *
 * Retorna:
 *   - Result.ok({ accountId }) cuando la cuenta existe.
 *   - Result.ok(null) cuando la cuenta NO existe (usuario nunca importó de este banco).
 *   - Result.fail(PersistenciaFallidaError) ante cualquier error de Prisma.
 *
 * NUNCA llama upsert ni create — read-only by construction (D-05/ISP).
 */
export class PrismaAccountReader implements IAccountReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blindIndex: IBlindIndexService,
  ) {}

  async findByBanco(
    userId: string,
    banco: DetectedBank,
  ): Promise<Result<{ accountId: string } | null, PersistenciaFallidaError>> {
    try {
      const numeroCuentaNormalizado = normalizeNumeroCuenta(banco.numeroCuenta);
      const numeroCuentaBlindIndex = this.blindIndex.compute(
        numeroCuentaNormalizado,
      );

      const account = await this.prisma.account.findUnique({
        where: {
          userId_banco_tipoCuenta_numeroCuentaBlindIndex: {
            userId,
            banco: banco.banco,
            tipoCuenta: banco.tipoCuenta,
            numeroCuentaBlindIndex,
          },
        },
        select: { id: true },
      });

      if (account === null) {
        return Result.ok(null);
      }

      return Result.ok({ accountId: account.id });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo consultar la cuenta del usuario',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
