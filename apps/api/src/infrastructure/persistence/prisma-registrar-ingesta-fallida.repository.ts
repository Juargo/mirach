import { EstadoIngesta } from '@prisma/client';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import {
  IRegistrarIngestaFallidaWriter,
  RegistrarIngestaFallidaInput,
} from '../../application/ports/registrar-ingesta-fallida.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaRegistrarIngestaFallidaRepository — implementación Prisma del
 * ÚNICO escritor de filas FALLIDA (US-004, design.md §7.2,
 * single-writer-per-state D1).
 *
 * Sin `ICryptoService`: las filas de fallo no tocan columnas de dinero.
 * `accountId`/`banco` se omiten deliberadamente del `data` (quedan `null` —
 * columnas ya relajadas por la migración de US-004, ver design.md §3.3/D2).
 */
export class PrismaRegistrarIngestaFallidaRepository implements IRegistrarIngestaFallidaWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async registrar(
    input: RegistrarIngestaFallidaInput,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    try {
      await this.prisma.ingesta.create({
        data: {
          userId: input.userId,
          nombreArchivo: input.nombreArchivo,
          estado: EstadoIngesta.FALLIDA,
          motivoFallo: input.motivo,
        },
      });
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo registrar el intento fallido',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
