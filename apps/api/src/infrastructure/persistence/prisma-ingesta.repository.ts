import { EstadoIngesta } from '@prisma/client';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import {
  CrearIngestaProcesadaInput,
  IIngestaRepository,
} from '../../application/ports/ingesta-repository.port';
import type { PrismaClient } from '@prisma/client';
import { aPersistencia } from './transaccion.mapper';

/**
 * PrismaIngestaRepository — implementación Prisma del lado de escritura
 * exitosa (US-004, design.md §7.1).
 *
 * `persistirProcesada` es el ÚNICO escritor de filas PROCESADA
 * (single-writer-per-state, D1): un `ingesta.create` con
 * `transacciones: { createMany: {...} }` anidado — un solo statement, una
 * sola transacción implícita de Postgres. Si el `createMany` viola una CHECK
 * (p. ej. `cargo/abono >= 0`), TODO se revierte: cero filas de Ingesta y cero
 * de Transaccion, no solo las de Transaccion.
 *
 * Convierte cualquier error de infraestructura en
 * Result.fail(PersistenciaFallidaError): el contrato de aplicación nunca ve
 * excepciones.
 */
export class PrismaIngestaRepository implements IIngestaRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<
    Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>
  > {
    try {
      const ingesta = await this.prisma.ingesta.create({
        data: {
          userId: input.userId,
          accountId: input.accountId,
          banco: input.banco,
          nombreArchivo: input.nombreArchivo,
          estado: EstadoIngesta.PROCESADA,
          totalTransacciones: input.transacciones.length,
          duplicadosOmitidos: input.duplicadosOmitidos,
          procesadoEn: new Date(),
          transacciones: {
            createMany: {
              data: input.transacciones.map((tx) => ({
                ...aPersistencia(tx, this.crypto),
                accountId: input.accountId,
              })),
            },
          },
        },
      });
      return Result.ok({
        ingestaId: ingesta.id,
        total: input.transacciones.length,
      });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'falló la escritura atómica de la ingesta',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
