import { Result } from '../../shared/result';
import { Email } from '../../domain/value-objects/email';
import { calcularExpiracion } from '../../domain/value-objects/duracion-sesion';
import { VinculacionFallidaError } from '../../domain/errors/vinculacion-fallida.error';
import {
  ICuentaAnonimaRepository,
  ProveedorIdentidad,
} from '../ports/cuenta-anonima-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { ILogger } from '../ports/logger.port';
import { LoginUseCaseResult } from './login.use-case';

/** Largo máximo de `nombre` (mismo tope que `PATCH /api/perfil`). */
const NOMBRE_MAX = 80;

/** Identidad ya verificada por la ruta HTTP (firma, `iss`, `aud`, `exp`, nonce). */
export interface IdentidadAVincular {
  readonly proveedor: ProveedorIdentidad;
  readonly sub: string;
  readonly email: string | null;
  readonly emailVerificado: boolean;
  /** Relay privado de Apple; siempre `false` para Google. */
  readonly emailPrivado: boolean;
}

/**
 * VincularIdentidadUseCase — convierte una cuenta anónima en una cuenta con
 * Apple o Google (ADR-013), sin mover datos.
 *
 * Si la identidad ya tiene cuenta, falla con `cuenta-ya-existe` y no escribe
 * nada: la fusión es otra entrega. "Ya tiene cuenta" usa la regla del inicio
 * de sesión: por `sub`, o por email verificado que no sea un relay privado
 * de Apple (un relay no prueba ser dueño de otra cuenta).
 *
 * Al vincular, la sesión anónima (365 días) se reemplaza por una ordinaria:
 * primero se crea la nueva y después se revoca la anterior, para que un fallo
 * entre ambas no deje a la persona sin sesión. Un fallo al revocar no falla la
 * vinculación.
 *
 * Redacción (ADR-009): nunca se loguea sub, email ni nombre.
 */
export class VincularIdentidadUseCase {
  constructor(
    private readonly cuentas: ICuentaAnonimaRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    tokenHashActual: string;
    identidad: IdentidadAVincular;
    nombre?: string | null;
  }): Promise<Result<LoginUseCaseResult, VinculacionFallidaError>> {
    const { userId, tokenHashActual, identidad } = input;

    if (!(await this.cuentas.esAnonima(userId))) {
      return Result.fail(new VinculacionFallidaError('cuenta-no-anonima'));
    }

    if (
      await this.cuentas.existeIdentidad(identidad.proveedor, identidad.sub)
    ) {
      return Result.fail(new VinculacionFallidaError('cuenta-ya-existe'));
    }

    const email = emailUtilizable(identidad);

    if (
      email !== null &&
      !identidad.emailPrivado &&
      (await this.cuentas.existeEmailEnOtraCuenta(email, userId))
    ) {
      return Result.fail(new VinculacionFallidaError('cuenta-ya-existe'));
    }

    const vinculada = await this.cuentas.vincular({
      userId,
      proveedor: identidad.proveedor,
      sub: identidad.sub,
      email,
      nombre: nombreUtilizable(input.nombre),
    });
    this.logger.debug('vincular-identidad: outcome', {
      userId,
      proveedor: identidad.proveedor,
      vinculada,
    });

    if (!vinculada) {
      return Result.fail(new VinculacionFallidaError('cuenta-ya-existe'));
    }

    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());
    await this.sessions.crear({ userId, tokenHash, expiresAt });
    await this.revocarSesionAnonima(userId, tokenHashActual);
    this.logger.info('vincular-identidad: cuenta vinculada', {
      userId,
      proveedor: identidad.proveedor,
    });

    return Result.ok({ token, userId, expiresAt });
  }

  /**
   * La cuenta ya quedó vinculada y la sesión nueva ya existe: si revocar la
   * anterior falla, responder un error dejaría a la app sin el token nuevo y
   * un reintento respondería `cuenta-no-anonima`. Se registra y se sigue; la
   * sesión anterior deja de renovarse y vence sola.
   */
  private async revocarSesionAnonima(
    userId: string,
    tokenHash: string,
  ): Promise<void> {
    try {
      await this.sessions.revocarPorTokenHash(tokenHash);
    } catch (err) {
      this.logger.warn(
        'vincular-identidad: no se pudo revocar la sesión anónima',
        { userId, errorName: err instanceof Error ? err.name : 'UnknownError' },
      );
    }
  }
}

function emailUtilizable(identidad: IdentidadAVincular): Email | null {
  if (identidad.email === null || !identidad.emailVerificado) {
    return null;
  }

  const email = Email.crear(identidad.email);

  return email.isOk() ? email.getValue() : null;
}

function nombreUtilizable(nombre: string | null | undefined): string | null {
  const limpio = nombre?.trim() ?? '';

  return limpio === '' ? null : limpio.slice(0, NOMBRE_MAX);
}
