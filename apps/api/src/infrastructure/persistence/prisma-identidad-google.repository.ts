import { Prisma, type PrismaClient } from '@prisma/client';

import {
  IIdentidadGoogleRepository,
  NuevoUsuarioGoogle,
  UsuarioVinculable,
} from '../../application/ports/identidad-google-repository.port';
import { Email } from '../../domain/value-objects/email';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { copiarCatalogoTemplate } from './catalogo-template';

/**
 * PrismaIdentidadGoogleRepository — implementación de `IIdentidadGoogleRepository`
 * (design §5.2/§5.4/§5.5).
 *
 * `buscarPorEmail` consulta por `emailBlindIndex` — MISMO patrón que
 * `PrismaUserCredentialRepository.buscarPorEmail` (HMAC determinístico,
 * ADR-013/US-035). El caller (composition root) es responsable de inyectar
 * la MISMA instancia de `IBlindIndexService` que usa el resto del grafo de
 * auth — una segunda derivación produciría un índice distinto y rompería el
 * link silenciosamente (4R carry-forward, design §5.5).
 *
 * `vincularGoogleSub` es un `updateMany` CONDICIONAL, no un read-modify-write
 * (design §5.4): `WHERE id = userId AND googleSub IS NULL`. `count === 1`
 * confirma que este llamador ganó la carrera; `count === 0` significa que
 * otra escritura ya llenó `googleSub` entre el read y este write (carrera
 * perdida, resultado de negocio — no una falla). Una colisión de unicidad
 * TOCTOU (`P2002`, otro `googleSub` distinto apuntando a la misma fila en un
 * instante superpuesto) se captura y también resuelve a `false` — nunca
 * cruza el puerto como excepción (repo convention). Cualquier otro error de
 * Prisma SÍ propaga: es una falla de infraestructura real, no un resultado
 * de negocio modelado.
 */
export class PrismaIdentidadGoogleRepository implements IIdentidadGoogleRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blindIndex: IBlindIndexService,
    private readonly crypto: ICryptoService,
  ) {}

  /**
   * ADR-041 (signup-on-first-login). User + catálogo en UNA transacción
   * interactiva (misma mecánica que `PrismaDemoRepository.crear`): si la
   * copia del catálogo falla, el rollback incluye al usuario — nunca puede
   * existir un usuario sin catálogo (invariante ADR-036). La Session NO va
   * en esta transacción, a diferencia del demo: acá un usuario creado sin
   * sesión es benigno y auto-reparable (el siguiente intento resuelve por
   * `googleSub`), mismo razonamiento que el link+sesión del use case
   * (design §5.1). Tampoco se crea ningún Account: la cuenta centinela
   * manual (ADR-039) es lazy (`ensure` en el primer movimiento) y las
   * cuentas bancarias nacen con la primera ingesta.
   *
   * `passwordHash` no viaja en el create — la fila nace passwordless
   * (`prisma-user-credential.repository` ya colapsa NULL a credenciales
   * inválidas, sin enumeración).
   *
   * P2002 (emailBlindIndex o googleSub únicos de `User`) → `null`: carrera
   * de creación perdida, resultado de negocio — misma convención que
   * `vincularGoogleSub`. Cualquier otro P2002 (fix de revisión WARNING: la
   * transacción TAMBIÉN escribe `Categoria`/`PatronClasificacion` vía
   * `copiarCatalogoTemplate` — una unique compuesta de `Categoria`,
   * `@@unique([userId, nombre])`, ADR-036, jamás debería chocar con un
   * `userId` recién creado, pero SI choca es un bug de datos real, no una
   * carrera) propaga, igual que cualquier error no-P2002.
   */
  async crearDesdeGoogle(datos: NuevoUsuarioGoogle): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            nombre: datos.nombre,
            email: this.crypto.encrypt(datos.email.valor),
            emailBlindIndex: this.blindIndex.compute(datos.email.valor),
            googleSub: datos.googleSub,
          },
        });

        await copiarCatalogoTemplate(tx, user.id);

        return user.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        esCarreraDeCreacionUser(error)
      ) {
        return null;
      }
      throw error;
    }
  }

  async buscarPorGoogleSub(
    googleSub: string,
  ): Promise<UsuarioVinculable | null> {
    const user = await this.prisma.user.findUnique({
      where: { googleSub },
      select: { id: true, esDemo: true, googleSub: true },
    });

    return user === null ? null : this.aUsuarioVinculable(user);
  }

  async buscarPorEmail(email: Email): Promise<UsuarioVinculable | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailBlindIndex: this.blindIndex.compute(email.valor) },
      select: { id: true, esDemo: true, googleSub: true },
    });

    return user === null ? null : this.aUsuarioVinculable(user);
  }

  async buscarPorId(userId: string): Promise<UsuarioVinculable | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, esDemo: true, googleSub: true },
    });

    return user === null ? null : this.aUsuarioVinculable(user);
  }

  async vincularGoogleSub(userId: string, googleSub: string): Promise<boolean> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, googleSub: null },
        data: { googleSub },
      });

      return count === 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * VINC041-05, CA-03. Una sola sentencia, no lee-y-luego-escribe: el
   * invariante "una cuenta nunca queda sin método de acceso" vive en este
   * `WHERE`, no en un pre-check de aplicación — un read-then-write dejaría
   * una ventana TOCTOU y anularía la garantía por completo (design §1/Q4).
   * Ninguna columna única entra en juego, así que no hay `try/catch`: un
   * rechazo de Prisma aquí es siempre una falla real de infraestructura y
   * debe propagar a `errorMiddleware` (500).
   */
  async desvincularGoogleSub(userId: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: userId,
        passwordHash: { not: null },
        googleSub: { not: null },
      },
      data: { googleSub: null },
    });

    return count === 1;
  }

  private aUsuarioVinculable(user: {
    id: string;
    esDemo: boolean;
    googleSub: string | null;
  }): UsuarioVinculable {
    return { userId: user.id, esDemo: user.esDemo, googleSub: user.googleSub };
  }
}

/**
 * esCarreraDeCreacionUser — discrimina, para el P2002 de `crearDesdeGoogle`,
 * entre la carrera de creación esperada (unicidad de `User.emailBlindIndex`
 * o `User.googleSub`) y un P2002 real de otra tabla dentro de la MISMA
 * transacción (p. ej. la unique compuesta `Categoria(userId, bucketId,
 * nombre)`, ADR-042 — un bug de datos, nunca una carrera legítima sobre un
 * `userId` recién creado).
 *
 * Misma forma de `meta` que `apuntaA` en
 * `prisma-user-credential.repository.ts` (Prisma 7 + `@prisma/adapter-pg` NO
 * puebla `meta.target`; el error crudo de Postgres llega bajo
 * `meta.driverAdapterError.cause.constraint.fields`/`.originalMessage`) —
 * `target` puede ser `string[]` o `string` (nombre del constraint) según
 * driver/versión, así que ambas formas se normalizan a una lista de strings.
 *
 * Semántica por-defecto DELIBERADAMENTE INVERSA a `apuntaA`: acá `target`
 * AUSENTE resuelve a `true` (carrera conservadora) en vez de `false`
 * (fail-closed hacia rethrow) — la única fila que compite dentro de esta
 * transacción es la del propio `tx.user.create`, así que un P2002 sin forma
 * reconocible sigue siendo, con altísima probabilidad, esa carrera. Solo un
 * target que SÍ nombra explícitamente una columna ajena a
 * `emailBlindIndex`/`googleSub` es la señal positiva de un bug real.
 */
function esCarreraDeCreacionUser(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  const meta = error.meta as
    | {
        target?: unknown;
        driverAdapterError?: {
          cause?: {
            constraint?: { fields?: unknown };
            originalMessage?: unknown;
          };
        };
      }
    | undefined;

  const targets: string[] = [];

  const target = meta?.target;
  if (Array.isArray(target)) {
    targets.push(...target.filter((t): t is string => typeof t === 'string'));
  } else if (typeof target === 'string') {
    targets.push(target);
  }

  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields)) {
    targets.push(...fields.filter((f): f is string => typeof f === 'string'));
  }

  const originalMessage = meta?.driverAdapterError?.cause?.originalMessage;
  if (typeof originalMessage === 'string') {
    targets.push(originalMessage);
  }

  if (targets.length === 0) return true; // target ausente → carrera conservadora

  return targets.some(
    (t) => t.includes('emailBlindIndex') || t.includes('googleSub'),
  );
}
