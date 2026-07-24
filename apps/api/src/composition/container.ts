import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../infrastructure/persistence/create-prisma-client';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { CalcularResumenMesUseCase } from '../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../application/use-cases/calcular-resumen-anual.use-case';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { PrismaResumenMesRepository } from '../infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaResumenAnualRepository } from '../infrastructure/persistence/prisma-resumen-anual.repository';
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

  return {
    validarSesion,
    calcularResumenMes,
    calcularResumenAnual,
    shutdown: () => prisma.$disconnect(),
  };
}
