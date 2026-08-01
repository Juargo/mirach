import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { createPrismaClient } from '../infrastructure/persistence/create-prisma-client';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../application/use-cases/crear-demo.use-case';
import { CalcularResumenMesUseCase } from '../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../application/use-cases/calcular-resumen-anual.use-case';
import { ObtenerDetalleBucketUseCase } from '../application/use-cases/obtener-detalle-bucket.use-case';
import { ObtenerMovimientosMesUseCase } from '../application/use-cases/obtener-movimientos-mes.use-case';
import { ReclasificarTransaccionUseCase } from '../application/use-cases/reclasificar-transaccion.use-case';
import { ProcessIngestaUseCase } from '../application/use-cases/process-ingesta.use-case';
import { EliminarIngestaUseCase } from '../application/use-cases/eliminar-ingesta.use-case';
import { ListarIngestasUseCase } from '../application/use-cases/listar-ingestas.use-case';
import { LoginRateLimiter } from '../infrastructure/http/auth/login-rate-limiter';
import { DemoRateLimiter } from '../infrastructure/http/auth/demo-rate-limiter';
import { DemoCleanupService } from '../infrastructure/http/auth/demo-cleanup.service';
import { crearAuth } from './crear-auth';
import { crearProcessIngesta } from './crear-process-ingesta';
import { crearPreviewIngesta } from './crear-preview-ingesta';
import { PreviewIngestaUseCase } from '../application/use-cases/preview-ingesta.use-case';
import { PrismaResumenMesRepository } from '../infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaResumenAnualRepository } from '../infrastructure/persistence/prisma-resumen-anual.repository';
import { PrismaDetalleBucketRepository } from '../infrastructure/persistence/prisma-detalle-bucket.repository';
import { PrismaMovimientosMesRepository } from '../infrastructure/persistence/prisma-movimientos-mes.repository';
import { PrismaReclasificarCategoriaRepository } from '../infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { PrismaEliminarIngestaRepository } from '../infrastructure/persistence/prisma-eliminar-ingesta.repository';
import { PrismaListarIngestasReader } from '../infrastructure/persistence/prisma-listar-ingestas.reader';
import { AesGcmCryptoService } from '../infrastructure/persistence/aes-gcm-crypto.service';

/**
 * Composition Root — ensamblado del grafo de dependencias (ADR-028/029).
 *
 * Es el ÚNICO lugar donde todas las capas se tocan: infrastructure implementa
 * los puertos de application, application usa el dominio. Sin framework de DI:
 * el grafo se arma a mano con `new` y se lee de arriba a abajo. Los sub-grafos
 * grandes (ingesta, auth) viven en helpers `crear*` para mantener esto legible.
 *
 * ADR-029: `env` es el primer parámetro — `createPrismaClient(env)` y
 * `crearAuth(prisma, env)` lo reciben inyectado, sin leer `process.env` en
 * ningún punto de este grafo.
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
  /** Seam de solo-lectura detect→validate→normalize, sin persistir (US-003,
   * CA-04) — POST /api/ingestas/preview. Ni prisma ni crypto: no tiene cómo
   * alcanzar la BD. */
  readonly previewIngesta: PreviewIngestaUseCase;
  /** Borrado en cascada userId-isolado — DELETE /api/ingestas/:id. */
  readonly eliminarIngesta: EliminarIngestaUseCase;
  /** Listado de ingestas del usuario — GET /api/ingestas. */
  readonly listarIngestas: ListarIngestasUseCase;
  /** Login por credenciales — POST /api/auth/login. */
  readonly login: LoginUseCase;
  /** Revocar sesión — POST /api/auth/logout. */
  readonly logout: LogoutUseCase;
  /** Identidad del usuario autenticado — GET /api/auth/me. */
  readonly obtenerIdentidad: ObtenerIdentidadUseCase;
  /** Alta de cuenta demo — GET /api/auth/demo. */
  readonly crearDemo: CrearDemoUseCase;
  /** Rate limiter de login (por IP + email). */
  readonly loginRateLimiter: LoginRateLimiter;
  /** Rate limiter de demo (por IP). */
  readonly demoRateLimiter: DemoRateLimiter;
  /** Limpieza de demos expirados (lazy, en GET /demo). */
  readonly demoCleanup: DemoCleanupService;
  /** Cierra la conexión Prisma. Lo invoca el bootstrap ante SIGTERM/SIGINT. */
  readonly shutdown: () => Promise<void>;
}

export function createContainer(
  env: Env,
  prisma: PrismaClient = createPrismaClient(env),
): Container {
  const auth = crearAuth(prisma, env);

  const calcularResumenMes = new CalcularResumenMesUseCase(
    new PrismaResumenMesRepository(prisma),
  );
  const calcularResumenAnual = new CalcularResumenAnualUseCase(
    new PrismaResumenAnualRepository(prisma),
  );
  // Cifrado (ADR-013): UNA única instancia para todo el composition root,
  // decodificada de env.ENCRYPTION_KEY (ya validada como base64 de 32 bytes
  // por loadEnv) — se inyecta tanto en estos readers como en el pipeline de
  // ingesta (crearProcessIngesta) para que el ciphertext que escribe la
  // ingesta descifre con la misma clave.
  const crypto = new AesGcmCryptoService(
    Buffer.from(env.ENCRYPTION_KEY, 'base64'),
  );

  const obtenerDetalleBucket = new ObtenerDetalleBucketUseCase(
    new PrismaDetalleBucketRepository(prisma, crypto),
  );
  const obtenerMovimientosMes = new ObtenerMovimientosMesUseCase(
    new PrismaMovimientosMesRepository(prisma, crypto),
  );
  const reclasificarTransaccion = new ReclasificarTransaccionUseCase(
    new PrismaReclasificarCategoriaRepository(prisma),
  );
  const processIngesta = crearProcessIngesta(prisma, crypto);
  const previewIngesta = crearPreviewIngesta();
  const eliminarIngesta = new EliminarIngestaUseCase(
    new PrismaEliminarIngestaRepository(prisma),
  );
  const listarIngestas = new ListarIngestasUseCase(
    new PrismaListarIngestasReader(prisma),
  );

  return {
    validarSesion: auth.validarSesion,
    calcularResumenMes,
    calcularResumenAnual,
    obtenerDetalleBucket,
    obtenerMovimientosMes,
    reclasificarTransaccion,
    processIngesta,
    previewIngesta,
    eliminarIngesta,
    listarIngestas,
    login: auth.login,
    logout: auth.logout,
    obtenerIdentidad: auth.obtenerIdentidad,
    crearDemo: auth.crearDemo,
    loginRateLimiter: auth.loginRateLimiter,
    demoRateLimiter: auth.demoRateLimiter,
    demoCleanup: auth.demoCleanup,
    shutdown: () => prisma.$disconnect(),
  };
}
