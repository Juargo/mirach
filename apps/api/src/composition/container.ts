import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../infrastructure/persistence/create-prisma-client';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { CalcularResumenMesUseCase } from '../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../application/use-cases/calcular-resumen-anual.use-case';
import { ObtenerDetalleBucketUseCase } from '../application/use-cases/obtener-detalle-bucket.use-case';
import { ObtenerMovimientosMesUseCase } from '../application/use-cases/obtener-movimientos-mes.use-case';
import { ReclasificarTransaccionUseCase } from '../application/use-cases/reclasificar-transaccion.use-case';
import { ProcessIngestaUseCase } from '../application/use-cases/process-ingesta.use-case';
import { crearProcessIngesta } from './crear-process-ingesta';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { PrismaResumenMesRepository } from '../infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaResumenAnualRepository } from '../infrastructure/persistence/prisma-resumen-anual.repository';
import { PrismaDetalleBucketRepository } from '../infrastructure/persistence/prisma-detalle-bucket.repository';
import { PrismaMovimientosMesRepository } from '../infrastructure/persistence/prisma-movimientos-mes.repository';
import { PrismaReclasificarCategoriaRepository } from '../infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';

/**
 * Composition Root — ensamblado del grafo de dependencias (ADR-028).
 *
 * Es el ÚNICO lugar donde todas las capas se tocan: infrastructure implementa
 * los puertos de application, application usa el dominio. Sin framework de DI:
 * el grafo se arma a mano con `new` y se lee de arriba a abajo.
 *
 * La interfaz `Container` crece un use case por slice de la migración.
 *
 * Nota: `Sha256SessionTokenService` y `SystemReloj` viven hoy bajo
 * `infrastructure/http/auth/` (son framework-agnósticos); se reubican a un
 * paquete neutral en el cutover (Slice 8), cuando se borre `http/`.
 */
export interface Container {
  /** Valida el token de sesión (cookie/Bearer). Lo usa el session middleware. */
  readonly validarSesion: ValidarSesionUseCase;
  /** 50/30/20 mensual — GET /api/resumen. */
  readonly calcularResumenMes: CalcularResumenMesUseCase;
  /** 50/30/20 anual — GET /api/resumen/anual. */
  readonly calcularResumenAnual: CalcularResumenAnualUseCase;
  /** Detalle de un bucket — GET /api/buckets/:bucket. */
  readonly obtenerDetalleBucket: ObtenerDetalleBucketUseCase;
  /** Lista mensual consolidada — GET /api/movimientos. */
  readonly obtenerMovimientosMes: ObtenerMovimientosMesUseCase;
  /** Reclasificación manual — PATCH /api/transacciones/:id/categoria. */
  readonly reclasificarTransaccion: ReclasificarTransaccionUseCase;
  /** Pipeline de ingesta xlsx/pdf — POST /api/ingestas. */
  readonly processIngesta: ProcessIngestaUseCase;
  /** Cierra la conexión Prisma. Lo invoca el bootstrap ante SIGTERM/SIGINT. */
  readonly shutdown: () => Promise<void>;
}

export function createContainer(
  prisma: PrismaClient = createPrismaClient(),
): Container {
  const validarSesion = new ValidarSesionUseCase(
    new PrismaSessionRepository(prisma),
    new Sha256SessionTokenService(),
    new SystemReloj(),
  );

  const calcularResumenMes = new CalcularResumenMesUseCase(
    new PrismaResumenMesRepository(prisma),
  );
  const calcularResumenAnual = new CalcularResumenAnualUseCase(
    new PrismaResumenAnualRepository(prisma),
  );
  const obtenerDetalleBucket = new ObtenerDetalleBucketUseCase(
    new PrismaDetalleBucketRepository(prisma),
  );
  const obtenerMovimientosMes = new ObtenerMovimientosMesUseCase(
    new PrismaMovimientosMesRepository(prisma),
  );
  const reclasificarTransaccion = new ReclasificarTransaccionUseCase(
    new PrismaReclasificarCategoriaRepository(prisma),
  );
  const processIngesta = crearProcessIngesta(prisma);

  return {
    validarSesion,
    calcularResumenMes,
    calcularResumenAnual,
    obtenerDetalleBucket,
    obtenerMovimientosMes,
    reclasificarTransaccion,
    processIngesta,
    shutdown: () => prisma.$disconnect(),
  };
}
