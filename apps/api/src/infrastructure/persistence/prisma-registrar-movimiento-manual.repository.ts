import type { PrismaClient } from '@prisma/client';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import {
  IRegistrarMovimientoManualWriter,
  RegistrarMovimientoManualInput,
} from '../../application/ports/registrar-movimiento-manual.port';
import { BUCKET_IDS } from './bucket-ids';
import { normalizeNumeroCuenta } from './normalize-numero-cuenta';

/**
 * Sentinel values for the manual account (D-05).
 *
 * MUST be declared as module-level constants — NEVER inline string literals.
 * A typo on any call site would silently produce a second sentinel row via
 * the 4-field composite unique key, breaking per-user upsert idempotency
 * without any compile-time or runtime warning.
 */
const SENTINEL_BANCO = 'Manual';
const SENTINEL_TIPO_CUENTA = 'Manual';
const SENTINEL_NUMERO_CUENTA_RAW = 'MANUAL';

/**
 * PrismaRegistrarMovimientoManualRepository — adapter that persists a manual
 * movement (US-058, D-05/D-08).
 *
 * `asegurarCuentaManual`: idempotent upsert of the per-user sentinel Account
 *   (banco='Manual'). Uses the same composite key and crypto/blind-index
 *   mechanics as PrismaAccountRepository.ensure, but with fixed sentinel
 *   values instead of a DetectedBank (D-05: 'Manual' is not a BancoConocido).
 *
 * `registrar`: single Transaccion.create with ingestaId=null, origen='Manual',
 *   bucketId resolved via BUCKET_IDS, descripcion encrypted (ADR-013).
 *   No Ingesta row is written (D-09: no historial for manual movements).
 */
export class PrismaRegistrarMovimientoManualRepository implements IRegistrarMovimientoManualWriter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
    private readonly blindIndex: IBlindIndexService,
  ) {}

  async asegurarCuentaManual(
    userId: string,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>> {
    try {
      const numeroCuentaNormalizado = normalizeNumeroCuenta(
        SENTINEL_NUMERO_CUENTA_RAW,
      );
      // The blind index MUST NOT be skipped: a null numeroCuentaBlindIndex
      // would break upsert idempotency under Postgres unique-NULL semantics
      // (two NULLs in a unique column are distinct → a new sentinel row on
      // every call instead of finding the existing one). D-05.
      const numeroCuentaBlindIndex = this.blindIndex.compute(
        numeroCuentaNormalizado,
      );

      const account = await this.prisma.account.upsert({
        where: {
          userId_banco_tipoCuenta_numeroCuentaBlindIndex: {
            userId,
            banco: SENTINEL_BANCO,
            tipoCuenta: SENTINEL_TIPO_CUENTA,
            numeroCuentaBlindIndex,
          },
        },
        create: {
          userId,
          banco: SENTINEL_BANCO,
          tipoCuenta: SENTINEL_TIPO_CUENTA,
          numeroCuenta: this.crypto.encrypt(numeroCuentaNormalizado),
          numeroCuentaBlindIndex,
        },
        update: {},
      });

      return Result.ok({ accountId: account.id });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo asegurar la cuenta centinela para movimiento manual',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  async registrar(
    input: RegistrarMovimientoManualInput,
  ): Promise<Result<{ id: string }, PersistenciaFallidaError>> {
    try {
      const tx = await this.prisma.transaccion.create({
        data: {
          ingestaId: null,
          origen: 'Manual',
          accountId: input.accountId,
          fecha: input.transaccion.fecha,
          // descripcion is encrypted at rest (ADR-013); the response DTO uses
          // the plaintext from the in-memory VO — no DB read-back needed (D-08).
          descripcion: this.crypto.encrypt(input.transaccion.descripcion),
          cargo: input.transaccion.cargo,
          abono: input.transaccion.abono,
          bucketId: BUCKET_IDS[input.bucket],
          categoriaId: input.categoriaId,
        },
      });

      return Result.ok({ id: tx.id });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo persistir el movimiento manual',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
