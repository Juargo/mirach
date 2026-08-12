import {
  IUserCredentialRepository,
  CredencialUsuario,
  IdentidadUsuario,
} from '../../application/ports/user-credential-repository.port';
import { Email } from '../../domain/value-objects/email';
import { EmailNoDisponibleError } from '../../domain/errors/email-no-disponible.error';
import { Result } from '../../shared/result';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';

/**
 * PrismaUserCredentialRepository — implementación de `IUserCredentialRepository`.
 *
 * `buscarPorEmail` retorna `null` tanto para email desconocido como para un
 * usuario sin `passwordHash` (sin credenciales de login todavía) — ambos
 * casos son "no se puede loguear", y `LoginUseCase` los colapsa al mismo
 * `CredencialesInvalidasError` (AUTH-02, no enumeración).
 *
 * US-035 (email cifrado en reposo, ADR-013): `User.email` ahora es
 * ciphertext v1, no texto plano, así que ya no se puede buscar por
 * `WHERE email = ...` (AES-GCM es no-determinístico). `buscarPorEmail`
 * consulta por `emailBlindIndex` (HMAC determinístico, ver
 * `IBlindIndexService`/`HmacBlindIndexService`) en su lugar. `buscarIdentidad`
 * sigue devolviendo el email en texto plano — se descifra acá antes de
 * devolverlo, nunca se expone el ciphertext.
 *
 * Constructor takes PrismaService directly (no NestJS decorators — clean arch).
 */
export class PrismaUserCredentialRepository implements IUserCredentialRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
    private readonly blindIndex: IBlindIndexService,
  ) {}

  async buscarPorEmail(email: Email): Promise<CredencialUsuario | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailBlindIndex: this.blindIndex.compute(email.valor) },
      select: { id: true, passwordHash: true },
    });

    if (user === null || user.passwordHash === null) {
      return null;
    }

    return { userId: user.id, passwordHash: user.passwordHash };
  }

  async buscarIdentidad(userId: string): Promise<IdentidadUsuario | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, email: true, esDemo: true },
    });

    if (user === null) {
      return null;
    }

    return this.aIdentidadUsuario(user);
  }

  /**
   * PERF040-03. `null` tanto para usuario inexistente como para usuario sin
   * `passwordHash` (login solo-Google, ADR-034/035) — el use case colapsa
   * ambos al mismo `PerfilRechazadoError` (§1/Q3). NUNCA selecciona `email`
   * (ISP — `CredencialUsuario` no debe cargar PII que no necesita).
   */
  async buscarCredencialPorId(
    userId: string,
  ): Promise<CredencialUsuario | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (user === null || user.passwordHash === null) {
      return null;
    }

    return { userId: user.id, passwordHash: user.passwordHash };
  }

  /**
   * PERF040-01/02, design.md §4.1. UN solo `prisma.user.update()`; `data` es
   * dos spreads — `nombre` absente ⇒ `{}`, `camposEmail` absente ⇒ `{}`
   * (§1/Q4a) — así que un PATCH de solo `nombre` deja el ciphertext y el
   * índice del email BYTE-IDÉNTICOS (PERF040-01's structural guarantee, G3).
   */
  async actualizarPerfil(input: {
    userId: string;
    nombre?: string;
    email?: Email;
  }): Promise<Result<IdentidadUsuario, EmailNoDisponibleError>> {
    try {
      const row = await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          ...(input.nombre === undefined ? {} : { nombre: input.nombre }),
          ...this.camposEmail(input.email),
        },
        select: { id: true, nombre: true, email: true, esDemo: true },
      });

      const identidad = this.aIdentidadUsuario(row);
      if (identidad === null) {
        // Fila inconsistente (usuario real con email null) tras un update
        // exitoso — NO es un resultado de negocio. Falla de infraestructura
        // ⇒ propaga, el errorMiddleware responde 500 (design.md §4.1).
        throw new Error(
          `Identidad inconsistente tras actualizar el perfil de ${input.userId}`,
        );
      }

      return Result.ok(identidad);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        apuntaA(error.meta, 'emailBlindIndex')
      ) {
        return Result.fail(new EmailNoDisponibleError());
      }
      throw error; // cualquier otra colisión/falla: infraestructura, NO negocio (design.md §4.2)
    }
  }

  /**
   * camposEmail — la ÚNICA derivación del par (email, emailBlindIndex) en
   * toda la app (PERF040-02, ADR-013), junto con `buscarPorEmail` arriba
   * (misma clase, mismo archivo — derivación simétrica). Ambas columnas
   * salen del MISMO `email.valor` (ya normalizado por `Email.crear` — trim +
   * lowercase), en el MISMO literal, usando las instancias `crypto`/
   * `blindIndex` que el composition root construyó UNA vez. Ausencia ⇒ `{}`:
   * Prisma no emite columna alguna, así que un PATCH de solo `nombre` deja
   * el ciphertext y el índice BYTE-IDÉNTICOS.
   *
   * NO devolver `{ email: undefined, emailBlindIndex: undefined }`: funciona
   * en Prisma, pero deja de ser imposible escribir media pareja (un `null`
   * por error NULea la columna). El `{}` no puede expresar media pareja.
   */
  private camposEmail(email: Email | undefined) {
    if (email === undefined) return {};
    return {
      email: this.crypto.encrypt(email.valor),
      emailBlindIndex: this.blindIndex.compute(email.valor),
    };
  }

  /**
   * aIdentidadUsuario — mapper compartido entre `buscarIdentidad` y
   * `actualizarPerfil` (drift contenido estructuralmente, design.md Q2).
   *
   * A diferencia de un usuario real (que siempre tiene email), un usuario
   * demo NUNCA tiene email (`esDemo=true, email=null`) — eso es válido, no
   * "identidad incompleta" (DEMO-AUTH-05). Pero un usuario REAL
   * (`esDemo=false`) sin email es un estado inconsistente (todo usuario real
   * se crea con email) — falla cerrado (`null`) en vez de exponer una
   * identidad rota.
   */
  private aIdentidadUsuario(user: {
    id: string;
    nombre: string;
    email: string | null;
    esDemo: boolean;
  }): IdentidadUsuario | null {
    if (!user.esDemo && user.email === null) {
      return null;
    }

    // El email persistido es ciphertext v1 (US-035) — nunca `null` en este
    // punto salvo demo (ya cubierto arriba), así que decrypt() solo se llama
    // sobre un valor real.
    const email = user.email === null ? null : this.crypto.decrypt(user.email);

    return { userId: user.id, nombre: user.nombre, email, esDemo: user.esDemo };
  }
}

/**
 * `meta.target` es `string[]` (nombres de columna) en la mayoría de las
 * combinaciones driver/versión, pero históricamente también llegó como
 * `string` (nombre del constraint, p. ej. "User_emailBlindIndex_key"). Ambas
 * formas contienen el nombre de la columna, así que ambas se aceptan.
 * DESCONOCIDO ⇒ false ⇒ RETHROW (fail-closed, design.md §4.2): un 500
 * visible es mejor que decirle "ese email ya está en uso" a alguien cuya
 * colisión real fue otra (p. ej. `googleSub`, también `@unique`).
 */
function apuntaA(meta: unknown, columna: string): boolean {
  const target = (meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(columna);
  if (typeof target === 'string') return target.includes(columna);
  return false;
}
