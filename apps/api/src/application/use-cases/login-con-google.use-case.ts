import { Result } from '../../shared/result';
import { Email } from '../../domain/value-objects/email';
import { calcularExpiracion } from '../../domain/value-objects/duracion-sesion';
import { LoginConGoogleFallidoError } from '../../domain/errors/login-con-google-fallido.error';
import { IIdentidadGoogleRepository } from '../ports/identidad-google-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { IdentidadExterna } from '../ports/verificador-identidad-externa.port';
import { LoginUseCaseResult } from './login.use-case';

/**
 * LoginConGoogleUseCase — resolución de identidad Google + emisión de sesión
 * (AUTH-13/14), per design §5.1/§5.3.
 *
 * find-only: nunca crea un usuario. Todas las ramas de fallo colapsan al
 * mismo `LoginConGoogleFallidoError` (AUTH-15 — no enumeración). No recibe
 * `IIniciadorLoginExterno`/`IVerificadorIdentidadExterna` — la ruta HTTP ya
 * verificó la identidad externa antes de invocar este use case (design §1).
 *
 * No abre transacción explícita (design §5.1): dos escrituras secuenciales
 * sin invariante compartida — si el link aplica y la sesión falla, el
 * usuario queda linkeado pero no logueado, estado benigno y auto-reparable
 * en el siguiente intento (resuelve vía `googleSub`).
 *
 * Orden de ejecución (NO el orden de lectura de design §5.3, que lista
 * `Email.crear` primero por legibilidad): `buscarPorGoogleSub` corre
 * SIEMPRE primero — antes del gate de `emailVerificado` y antes de
 * `buscarPorEmail` (ver design §5.6, tabla de conteo de queries).
 */
export class LoginConGoogleUseCase {
  constructor(
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
  ) {}

  async execute(
    identidad: IdentidadExterna,
  ): Promise<Result<LoginUseCaseResult, LoginConGoogleFallidoError>> {
    const porGoogleSub = await this.identidades.buscarPorGoogleSub(
      identidad.sub,
    );

    if (porGoogleSub !== null) {
      if (porGoogleSub.esDemo) {
        return Result.fail(new LoginConGoogleFallidoError('usuario-demo'));
      }
      return this.emitirSesion(porGoogleSub.userId);
    }

    if (!identidad.emailVerificado) {
      return Result.fail(new LoginConGoogleFallidoError('email-no-verificado'));
    }

    if (identidad.email === null) {
      return Result.fail(new LoginConGoogleFallidoError('email-invalido'));
    }

    const emailResult = Email.crear(identidad.email);

    if (emailResult.isFail()) {
      return Result.fail(new LoginConGoogleFallidoError('email-invalido'));
    }

    const porEmail = await this.identidades.buscarPorEmail(
      emailResult.getValue(),
    );

    if (porEmail === null) {
      return Result.fail(new LoginConGoogleFallidoError('sin-match'));
    }

    if (porEmail.esDemo) {
      return Result.fail(new LoginConGoogleFallidoError('usuario-demo'));
    }

    // ★ No en el spec, agregado por el diseño (§5.3): el step de
    // `buscarPorGoogleSub` ya falló en matchear, así que un `googleSub`
    // no-null acá pertenece a una identidad Google DISTINTA. Sobrescribir
    // sería un primitivo de account-takeover — se rechaza sin re-linkear.
    if (porEmail.googleSub !== null) {
      return Result.fail(
        new LoginConGoogleFallidoError('ya-vinculado-a-otra-identidad'),
      );
    }

    const linkeado = await this.identidades.vincularGoogleSub(
      porEmail.userId,
      identidad.sub,
    );

    if (!linkeado) {
      return Result.fail(
        new LoginConGoogleFallidoError('link-perdio-la-carrera'),
      );
    }

    return this.emitirSesion(porEmail.userId);
  }

  /** Emisión de sesión byte-idéntica a `LoginUseCase` (design §5.3 paso 5). */
  private async emitirSesion(
    userId: string,
  ): Promise<Result<LoginUseCaseResult, LoginConGoogleFallidoError>> {
    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());

    await this.sessions.crear({ userId, tokenHash, expiresAt });

    return Result.ok({ token, userId, expiresAt });
  }
}
