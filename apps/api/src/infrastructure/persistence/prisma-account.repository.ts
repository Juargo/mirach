import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { DetectedBank } from '../../application/ports/bank-detector.port';
import { IAccountRepository } from '../../application/ports/account-repository.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import { normalizeNumeroCuenta } from './normalize-numero-cuenta';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaAccountRepository — implementación Prisma del upsert idempotente de
 * Account por la clave natural (userId, banco, tipoCuenta, numeroCuenta).
 *
 * US-035 Slice 2: `numeroCuenta` se persiste CIFRADO en reposo (AES-GCM,
 * ADR-013) — el IV aleatorio hace que dos cifrados del mismo número difieran,
 * así que la clave natural del upsert ya no puede ser `numeroCuenta` en
 * claro. Se busca/crea por `numeroCuentaBlindIndex` (HMAC determinístico
 * sobre `normalizeNumeroCuenta(numeroCuenta)`, ver
 * `application/ports/blind-index-service.port.ts`) — MISMA clave HMAC que el
 * blind index de email de Slice 1 (derivada del mismo `ENCRYPTION_KEY`, ver
 * `composition/derive-blind-index-key.ts`), sin env var nuevo.
 *
 * `ensure` es idempotente: si la cuenta ya existe (mismo blind index) devuelve
 * su id sin duplicar. Convierte errores de infraestructura en
 * Result.fail(PersistenciaFallidaError).
 */
export class PrismaAccountRepository implements IAccountRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
    private readonly blindIndex: IBlindIndexService,
  ) {}

  async ensure(
    userId: string,
    banco: DetectedBank,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>> {
    try {
      const numeroCuentaNormalizado = normalizeNumeroCuenta(banco.numeroCuenta);
      const numeroCuentaBlindIndex = this.blindIndex.compute(
        numeroCuentaNormalizado,
      );

      const account = await this.prisma.account.upsert({
        where: {
          userId_banco_tipoCuenta_numeroCuentaBlindIndex: {
            userId,
            banco: banco.banco,
            tipoCuenta: banco.tipoCuenta,
            numeroCuentaBlindIndex,
          },
        },
        create: {
          userId,
          banco: banco.banco,
          tipoCuenta: banco.tipoCuenta,
          numeroCuenta: this.crypto.encrypt(numeroCuentaNormalizado),
          numeroCuentaBlindIndex,
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
