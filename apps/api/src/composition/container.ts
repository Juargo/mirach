import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import type { PinoLogger } from '../infrastructure/logging/pino-logger';
import { createPrismaClient } from '../infrastructure/persistence/create-prisma-client';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../application/use-cases/crear-demo.use-case';
import { CalcularResumenMesUseCase } from '../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../application/use-cases/calcular-resumen-anual.use-case';
import { ObtenerSemaforoDetalleUseCase } from '../application/use-cases/obtener-semaforo-detalle.use-case';
import { ObtenerDetalleBucketUseCase } from '../application/use-cases/obtener-detalle-bucket.use-case';
import { ObtenerDetalleBucketMesUseCase } from '../application/use-cases/obtener-detalle-bucket-mes.use-case';
import { ObtenerIngresosMesUseCase } from '../application/use-cases/obtener-ingresos-mes.use-case';
import { ObtenerMovimientosMesUseCase } from '../application/use-cases/obtener-movimientos-mes.use-case';
import { ReclasificarTransaccionUseCase } from '../application/use-cases/reclasificar-transaccion.use-case';
import { ProcessIngestaUseCase } from '../application/use-cases/process-ingesta.use-case';
import { EliminarIngestaUseCase } from '../application/use-cases/eliminar-ingesta.use-case';
import { ListarIngestasUseCase } from '../application/use-cases/listar-ingestas.use-case';
import { LoginRateLimiter } from '../infrastructure/http/auth/login-rate-limiter';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';
import { DemoCleanupService } from '../infrastructure/http/auth/demo-cleanup.service';
import { crearAuth } from './crear-auth';
import { crearAuthGoogle, type GoogleAuthGraph } from './crear-auth-google';
import {
  crearAuthGoogleMobile,
  type GoogleAuthMobileGraph,
} from './crear-auth-google-mobile';
import { crearProcessIngesta } from './crear-process-ingesta';
import { crearPreviewIngesta } from './crear-preview-ingesta';
import { crearCommitIngesta } from './crear-commit-ingesta';
import { crearRegistrarMovimientoManual } from './crear-registrar-movimiento-manual';
import { crearCatalogo, type CatalogoGraph } from './crear-catalogo';
import { crearPerfil, type PerfilGraph } from './crear-perfil';
import { PreviewIngestaUseCase } from '../application/use-cases/preview-ingesta.use-case';
import { CommitIngestaUseCase } from '../application/use-cases/commit-ingesta.use-case';
import { RegistrarMovimientoManualUseCase } from '../application/use-cases/registrar-movimiento-manual.use-case';
import { PrismaResumenMesRepository } from '../infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaResumenAnualRepository } from '../infrastructure/persistence/prisma-resumen-anual.repository';
import { PrismaDetalleBucketRepository } from '../infrastructure/persistence/prisma-detalle-bucket.repository';
import { PrismaMovimientosMesRepository } from '../infrastructure/persistence/prisma-movimientos-mes.repository';
import { PrismaReclasificarCategoriaRepository } from '../infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { PrismaEliminarIngestaRepository } from '../infrastructure/persistence/prisma-eliminar-ingesta.repository';
import { PrismaListarIngestasReader } from '../infrastructure/persistence/prisma-listar-ingestas.reader';
import { AesGcmCryptoService } from '../infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../infrastructure/persistence/hmac-blind-index.service';
import {
  deriveBlindIndexKey,
  deriveLinkIntentKey,
} from './derive-blind-index-key';
import { createPinoLogger } from '../infrastructure/logging/pino-logger';

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
  /** Detalle de semáforo (US-049) — GET /api/resumen/semaforo. */
  readonly obtenerSemaforoDetalle: ObtenerSemaforoDetalleUseCase;
  /** Detalle de un bucket — GET /api/buckets/:bucket. */
  readonly obtenerDetalleBucket: ObtenerDetalleBucketUseCase;
  /** Detalle MES-BUCKET agrupado por categoría (US-051) — GET /api/buckets/:bucket/detalle. */
  readonly obtenerDetalleBucketMes: ObtenerDetalleBucketMesUseCase;
  /** Detalle MES-INGRESOS por origen (US-052) — GET /api/ingresos/mes. */
  readonly obtenerIngresosMes: ObtenerIngresosMesUseCase;
  /** Lista mensual consolidada — GET /api/movimientos. */
  readonly obtenerMovimientosMes: ObtenerMovimientosMesUseCase;
  /** Reclasificación manual — PATCH /api/transacciones/:id/categoria. */
  readonly reclasificarTransaccion: ReclasificarTransaccionUseCase;
  /** Pipeline de ingesta xlsx/pdf — POST /api/ingestas. */
  readonly processIngesta: ProcessIngestaUseCase;
  /** Seam de solo-lectura (US-003, US-057 D-12) — POST /api/ingestas/preview.
   * Recibe prisma/crypto/blindIndex pero cablea SOLO adapters de lectura
   * (PrismaAccountReader — sin upsert; PrismaTransaccionExistenteReader —
   * SELECT; catálogo reader). La garantía "nada se persiste" la imponen los
   * tipos de puerto read-only y el test de composición MANDATORY-BLOCKING de
   * PR4 (T-25). */
  readonly previewIngesta: PreviewIngestaUseCase;
  /** Único escritor del split preview→commit (US-057 PR4) — POST /api/ingestas/commit.
   * Wired with write adapters (PrismaAccountRepository, PrismaIngestaRepository)
   * via crearCommitIngesta; no-write guarantee belongs to previewIngesta. */
  readonly commitIngesta: CommitIngestaUseCase;
  /** Registro de movimiento manual (US-058) — POST /api/movimientos.
   * Narrow port: sentinel upsert + single Transaccion.create.
   * No Ingesta row, no file — type-first (Ingreso/Gasto discriminant). */
  readonly registrarMovimientoManual: RegistrarMovimientoManualUseCase;
  /** Borrado en cascada userId-isolado — DELETE /api/ingestas/:id. */
  readonly eliminarIngesta: EliminarIngestaUseCase;
  /** Listado de ingestas del usuario — GET /api/ingestas. */
  readonly listarIngestas: ListarIngestasUseCase;
  /** Catálogo CRUD (US-038) — `/api/categorias` + `/api/patrones`. */
  readonly catalogo: CatalogoGraph;
  /** Edición de perfil (US-040, PR#1) — `PATCH /api/perfil`. */
  readonly perfil: PerfilGraph;
  /** Login por credenciales — POST /api/auth/login. */
  readonly login: LoginUseCase;
  /** Revocar sesión — POST /api/auth/logout. */
  readonly logout: LogoutUseCase;
  /** Identidad del usuario autenticado — GET /api/auth/me. */
  readonly obtenerIdentidad: ObtenerIdentidadUseCase;
  /** Alta de cuenta demo — GET /api/auth/demo. */
  readonly crearDemo: CrearDemoUseCase;
  /** Login con Google (AUTH-11..18) — `undefined` cuando el feature está
   * apagado (GOOGLE_CLIENT_ID/SECRET ausentes, design §4.3/§4.4). El TIPO
   * de este campo es el seam de activación: `googleAuth !== undefined` es
   * la única pregunta que `app.ts` hace para decidir qué router montar. */
  readonly googleAuth?: GoogleAuthGraph;
  /** Login con Google mobile nativo (AUTH-19..24, ADR-035) — `undefined`
   * cuando el feature está apagado (GOOGLE_CLIENT_ID_ANDROID ausente, design
   * §7). Gate de activación TOTALMENTE independiente de `googleAuth` (web,
   * AUTH-22) — ambos pueden estar en cualquier combinación on/off. */
  readonly googleAuthMobile?: GoogleAuthMobileGraph;
  /** Rate limiter de login (por IP + email). */
  readonly loginRateLimiter: LoginRateLimiter;
  /** Rate limiter de demo (por IP). */
  readonly demoRateLimiter: IpRateLimiter;
  /** Limpieza de demos expirados (lazy, en GET /demo). */
  readonly demoCleanup: DemoCleanupService;
  /** Cierra la conexión Prisma. Lo invoca el bootstrap ante SIGTERM/SIGINT. */
  readonly shutdown: () => Promise<void>;
  /** Logger estructurado (ADR-033 slice 2/A) — instancia única del composition
   * root, inyectada en `ProcessIngestaUseCase`. Disponible acá también para
   * cualquier otro consumidor futuro que necesite loguear a través del
   * grafo real (no del singleton de infraestructura `app-logger.ts`). */
  readonly logger: PinoLogger;
}

export function createContainer(
  env: Env,
  prisma: PrismaClient = createPrismaClient(env),
): Container {
  // Cifrado (ADR-013): UNA única instancia para todo el composition root,
  // decodificada de env.ENCRYPTION_KEY (ya validada como base64 de 32 bytes
  // por loadEnv) — se inyecta tanto en estos readers como en el pipeline de
  // ingesta (crearProcessIngesta) para que el ciphertext que escribe la
  // ingesta descifre con la misma clave. Construida ANTES de crearAuth
  // porque PrismaUserCredentialRepository (US-035) también la necesita.
  const encryptionKey = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  const crypto = new AesGcmCryptoService(encryptionKey);
  // Blind index (US-035): la clave HMAC se DERIVA vía HKDF del MISMO
  // ENCRYPTION_KEY (ver derive-blind-index-key.ts) — no hay env var nuevo.
  // Slice 1: habilita `buscarPorEmail` (login) a buscar por
  // `WHERE emailBlindIndex = ...` en vez de por email en claro. Slice 2:
  // MISMA instancia reutilizada por `crearProcessIngesta` para que
  // `PrismaAccountRepository.ensure` busque/cree la cuenta por
  // `numeroCuentaBlindIndex` — ninguno de los dos es posible contra
  // ciphertext no-determinístico.
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(encryptionKey),
  );
  // Link-intent (US-041, design §3.4): SEGUNDA clave derivada del MISMO
  // ENCRYPTION_KEY, purpose-separada de blindIndex por `info`
  // (`derive-blind-index-key.ts`). Sitio único de derivación — nunca dentro
  // de `crearAuthGoogle` (GUARD non-negotiable, mismo hazard que el
  // incidente de producción de 2026-08-02).
  const linkIntentKey = deriveLinkIntentKey(encryptionKey);

  // Logging estructurado (ADR-033 slice 2/A): UNA instancia para todo el
  // composition root — pretty en development (legible en consola local),
  // JSON en el resto (production/test) para que el destino real (Render,
  // agregadores) reciba NDJSON parseable. `level` viene de `env.LOG_LEVEL`
  // (ya validado por `loadEnv`, default 'info') — construida ANTES de
  // `crearAuth`/`crearAuthGoogle`/`crearAuthGoogleMobile` porque los 6 use
  // cases de auth ahora la reciben inyectada (mismo patrón que
  // `crearProcessIngesta`).
  const logger = createPinoLogger({
    pretty: env.NODE_ENV === 'development',
    level: env.LOG_LEVEL,
  });

  const auth = crearAuth(prisma, env, crypto, blindIndex, logger);
  // Login con Google (design §4.3): `blindIndex` es la MISMA instancia
  // recién derivada arriba — nunca una segunda derivación (4R carry-forward,
  // design §5.5). `undefined` cuando GOOGLE_CLIENT_ID/SECRET están ausentes.
  const googleAuth = crearAuthGoogle(
    prisma,
    env,
    crypto,
    blindIndex,
    linkIntentKey,
    logger,
  );
  // Login con Google mobile (design §7): gate independiente de `googleAuth`
  // (AUTH-22) — misma instancia de `blindIndex`, nunca una re-derivación.
  const googleAuthMobile = crearAuthGoogleMobile(
    prisma,
    env,
    blindIndex,
    logger,
  );

  const calcularResumenMes = new CalcularResumenMesUseCase(
    new PrismaResumenMesRepository(prisma),
    logger,
  );
  const calcularResumenAnual = new CalcularResumenAnualUseCase(
    new PrismaResumenAnualRepository(prisma),
    logger,
  );
  // US-049, D-12: segunda instancia de PrismaResumenMesRepository (stateless,
  // sin costo) — matches el estilo un-`new`-por-use-case del archivo; no hay
  // helper `crear-*` para wiring de una sola línea (helpers son para
  // sub-grafos grandes como auth/ingesta).
  const obtenerSemaforoDetalle = new ObtenerSemaforoDetalleUseCase(
    new PrismaResumenMesRepository(prisma),
    logger,
  );

  const obtenerDetalleBucket = new ObtenerDetalleBucketUseCase(
    new PrismaDetalleBucketRepository(prisma, crypto),
    logger,
  );
  // US-051, D-10: UNA instancia de PrismaDetalleBucketRepository (misma
  // disciplina que el flat) + UNA de PrismaResumenMesRepository (segunda
  // instancia stateless, sin costo — precedente US-049 D-12). Sin helper
  // `crear-*`: helpers son para sub-grafos grandes; este wiring es de una
  // línea por repository, matches el estilo un-`new`-por-use-case del archivo.
  const obtenerDetalleBucketMes = new ObtenerDetalleBucketMesUseCase(
    new PrismaDetalleBucketRepository(prisma, crypto),
    new PrismaResumenMesRepository(prisma),
    logger,
  );
  // US-052, D-07: TERCERA instancia de PrismaDetalleBucketRepository (misma
  // disciplina un-`new`-por-use-case de US-049 D-12 / US-051 D-10 — las
  // instancias son stateless, sin costo; el patrón del archivo es una por use
  // case, NO una compartida) + UNA de ObtenerIngresosMesUseCase. Sin helper
  // `crear-*`: helpers son para sub-grafos grandes; este wiring es de una
  // línea por repository.
  const obtenerIngresosMes = new ObtenerIngresosMesUseCase(
    new PrismaDetalleBucketRepository(prisma, crypto),
    logger,
  );
  const obtenerMovimientosMes = new ObtenerMovimientosMesUseCase(
    new PrismaMovimientosMesRepository(prisma, crypto),
    logger,
  );
  const reclasificarTransaccion = new ReclasificarTransaccionUseCase(
    new PrismaReclasificarCategoriaRepository(prisma),
  );
  const processIngesta = crearProcessIngesta(
    prisma,
    crypto,
    blindIndex,
    logger,
  );
  const previewIngesta = crearPreviewIngesta(
    prisma,
    crypto,
    blindIndex,
    logger,
  );
  const commitIngesta = crearCommitIngesta(prisma, crypto, blindIndex, logger);
  const registrarMovimientoManual = crearRegistrarMovimientoManual(
    prisma,
    crypto,
    blindIndex,
    logger,
  );
  const eliminarIngesta = new EliminarIngestaUseCase(
    new PrismaEliminarIngestaRepository(prisma),
    logger,
  );
  const listarIngestas = new ListarIngestasUseCase(
    new PrismaListarIngestasReader(prisma),
    logger,
  );
  const catalogo = crearCatalogo(prisma);
  // US-040: reusa las MISMAS instancias crypto/blindIndex derivadas arriba —
  // nunca una re-derivación (mismo carry-forward que googleAuth/googleAuthMobile).
  const perfil = crearPerfil(prisma, crypto, blindIndex, logger);

  return {
    validarSesion: auth.validarSesion,
    calcularResumenMes,
    calcularResumenAnual,
    obtenerSemaforoDetalle,
    obtenerDetalleBucket,
    obtenerDetalleBucketMes,
    obtenerIngresosMes,
    obtenerMovimientosMes,
    reclasificarTransaccion,
    processIngesta,
    previewIngesta,
    commitIngesta,
    registrarMovimientoManual,
    eliminarIngesta,
    listarIngestas,
    catalogo,
    perfil,
    login: auth.login,
    logout: auth.logout,
    obtenerIdentidad: auth.obtenerIdentidad,
    crearDemo: auth.crearDemo,
    googleAuth,
    googleAuthMobile,
    loginRateLimiter: auth.loginRateLimiter,
    demoRateLimiter: auth.demoRateLimiter,
    demoCleanup: auth.demoCleanup,
    shutdown: () => prisma.$disconnect(),
    logger,
  };
}
