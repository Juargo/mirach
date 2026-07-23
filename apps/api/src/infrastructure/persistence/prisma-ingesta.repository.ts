import { EstadoIngesta } from '@prisma/client';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import {
  CrearIngestaInput,
  IIngestaRepository,
} from '../../application/ports/ingesta-repository.port';
import { PrismaService } from './prisma.service';
import { aPersistencia } from './transaccion.mapper';

/**
 * PrismaIngestaRepository — implementación Prisma del lado de escritura.
 *
 * Posee la escritura atómica: `commit` inserta las transacciones y transiciona
 * la Ingesta a PROCESADA dentro de un único `prisma.$transaction`. Convierte
 * cualquier error de infraestructura en Result.fail(PersistenciaFallidaError):
 * el contrato de aplicación nunca ve excepciones.
 */
export class PrismaIngestaRepository implements IIngestaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ICryptoService,
  ) {}

  async createPending(
    input: CrearIngestaInput,
  ): Promise<Result<{ ingestaId: string }, PersistenciaFallidaError>> {
    try {
      const ingesta = await this.prisma.ingesta.create({
        data: {
          accountId: input.accountId,
          banco: input.banco,
          nombreArchivo: input.nombreArchivo,
          estado: EstadoIngesta.PENDIENTE,
        },
      });
      return Result.ok({ ingestaId: ingesta.id });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo crear la ingesta PENDIENTE',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  async commit(
    ingestaId: string,
    accountId: string,
    transacciones: ReadonlyArray<Transaccion>,
    duplicadosOmitidos: number,
  ): Promise<Result<{ total: number }, PersistenciaFallidaError>> {
    try {
      const data = transacciones.map((tx) => ({
        ...aPersistencia(tx, this.crypto),
        ingestaId,
        accountId,
      }));

      // Atómico: inserción masiva + transición a PROCESADA (incluyendo el
      // conteo de duplicados omitidos, US-005) en una sola tx. Si el
      // createMany falla (p. ej. viola una CHECK), TODO se revierte: 0 filas
      // y la Ingesta permanece PENDIENTE.
      await this.prisma.$transaction([
        this.prisma.transaccion.createMany({ data }),
        this.prisma.ingesta.update({
          where: { id: ingestaId },
          data: {
            estado: EstadoIngesta.PROCESADA,
            totalTransacciones: transacciones.length,
            duplicadosOmitidos,
            procesadoEn: new Date(),
          },
        }),
      ]);

      return Result.ok({ total: transacciones.length });
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'falló la escritura atómica de transacciones',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  async markFailed(
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    try {
      await this.prisma.ingesta.update({
        where: { id: ingestaId },
        data: { estado: EstadoIngesta.FALLIDA, motivoFallo: motivo },
      });
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo marcar la ingesta como FALLIDA',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
