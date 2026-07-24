import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../infrastructure/persistence/create-prisma-client';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
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

  return {
    validarSesion,
    shutdown: () => prisma.$disconnect(),
  };
}
