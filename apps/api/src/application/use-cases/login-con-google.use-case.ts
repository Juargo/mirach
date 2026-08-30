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
import { ILogger } from '../ports/logger.port';

/**
 * LoginConGoogleResult — `LoginUseCaseResult` + `esNuevoUsuario` (fix de
 * revisión post-ADR-041, hallazgo CRITICAL de seguridad). El caller HTTP lo
 * necesita para decidir si resetea el rate limiter de IP en éxito — un
 * signup NUNCA debe resetearlo (ver `auth-google-token.routes.ts`), o un
 * único IP podría crear cuentas sin límite reseteando su propio presupuesto
 * en cada alta. `esNuevoUsuario` es SOLO server-side: nunca viaja en la
 * respuesta HTTP (AUTH-15 — no enumeración, el body es idéntico para login y
 * signup).
 */
export interface LoginConGoogleResult extends LoginUseCaseResult {
  readonly esNuevoUsuario: boolean;
}

/**
 * LoginConGoogleUseCase — resolución de identidad Google + emisión de sesión
 * (AUTH-13/14), per design §5.1/§5.3.
 *
 * ADR-041 (supersede parcial de ADR-034): ya NO es find-only — una identidad
 * verificada sin match por sub ni email CREA su cuenta (signup-on-first-login,
 * ver `crearCuenta`). El resto del contrato de ADR-034 sigue intacto: gate de
 * `emailVerificado`, link por email, guarda ★ anti-takeover, gates demo.
 * Todas las ramas de fallo colapsan al
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
    private readonly logger: ILogger,
  ) {}

  async execute(
    identidad: IdentidadExterna,
  ): Promise<Result<LoginConGoogleResult, LoginConGoogleFallidoError>> {
    const porGoogleSub = await this.identidades.buscarPorGoogleSub(
      identidad.sub,
    );
    // Redaction contract (ADR-013): NUNCA logueamos el sub, el email ni
    // ningún token — solo booleans/outcomes/userIds internos.
    this.logger.debug('login-con-google: googleSub lookup', {
      found: porGoogleSub !== null,
    });

    if (porGoogleSub !== null) {
      if (porGoogleSub.esDemo) {
        return Result.fail(new LoginConGoogleFallidoError('usuario-demo'));
      }
      return this.emitirSesion(porGoogleSub.userId, false);
    }

    this.logger.debug('login-con-google: email verified check', {
      emailVerificado: identidad.emailVerificado,
    });

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
    this.logger.debug('login-con-google: email lookup', {
      found: porEmail !== null,
    });

    if (porEmail === null) {
      return this.crearCuenta(identidad, emailResult.getValue());
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
    this.logger.debug('login-con-google: identity link outcome', {
      linkeado,
    });

    if (!linkeado) {
      return Result.fail(
        new LoginConGoogleFallidoError('link-perdio-la-carrera'),
      );
    }

    return this.emitirSesion(porEmail.userId, false);
  }

  /**
   * ADR-041 (signup-on-first-login): la rama sin-match de ADR-034 se
   * reemplaza por creación de cuenta. Solo se alcanza DESPUÉS del gate de
   * `emailVerificado` y de `Email.crear` — una identidad no verificada o
   * malformada nunca llega acá.
   *
   * `nombre` = parte local del email normalizado: `IdentidadExterna` no
   * trae el claim `name` y NO se amplía el scope OIDC para pedirlo (superficie
   * mínima, ADR-034 §scope) — el usuario puede corregirlo vía PATCH
   * /api/perfil (US-044).
   *
   * Carrera de creación (P2002 → `crearDesdeGoogle` retorna null): otra
   * petición ocupó el email o el sub entre el lookup y el write. Se
   * re-resuelve SOLO por `googleSub` — si el ganador es esta misma identidad
   * (doble submit del mismo login), emite sesión sobre esa fila; cualquier
   * otro resultado (fila demo, o un email tomado por OTRA identidad Google)
   * colapsa al error genérico (AUTH-15). No se reintenta el link por email:
   * el path de link ya existía ANTES del lookup fallido y volver a entrar
   * por ahí duplicaría sus guardas con estado a medio leer.
   *
   * `esNuevoUsuario` es SIEMPRE `true` en toda salida OK de este método —
   * incluida la rama "ganador" de la carrera: esta petición SÍ intentó
   * crear (`crearDesdeGoogle` corrió y perdió), así que sigue siendo un
   * intento de alta a efectos del rate limiter (fix de revisión CRITICAL —
   * si se marcara `false` acá, un atacante podría enviar N requests
   * concurrentes idénticas y usar las N-1 perdedoras para resetear su
   * presupuesto de IP en cada ronda).
   */
  private async crearCuenta(
    identidad: IdentidadExterna,
    email: Email,
  ): Promise<Result<LoginConGoogleResult, LoginConGoogleFallidoError>> {
    const nuevoUserId = await this.identidades.crearDesdeGoogle({
      email,
      googleSub: identidad.sub,
      nombre: email.valor.split('@')[0],
    });

    if (nuevoUserId !== null) {
      // Nivel info (no debug): señal de negocio observable en prod
      // (LOG_LEVEL=info) — burst-detection de alta de cuentas. Redacción
      // ADR-013: solo userId + outcome, nunca email ni sub.
      this.logger.info('login-con-google: usuario creado', {
        userId: nuevoUserId,
      });
      return this.emitirSesion(nuevoUserId, true);
    }

    this.logger.debug('login-con-google: signup outcome', {
      creado: false,
    });

    const ganador = await this.identidades.buscarPorGoogleSub(identidad.sub);
    this.logger.debug('login-con-google: signup race retry lookup', {
      found: ganador !== null,
    });

    if (ganador !== null && !ganador.esDemo) {
      return this.emitirSesion(ganador.userId, true);
    }

    return Result.fail(
      new LoginConGoogleFallidoError('creacion-perdio-la-carrera'),
    );
  }

  /** Emisión de sesión byte-idéntica a `LoginUseCase` (design §5.3 paso 5). */
  private async emitirSesion(
    userId: string,
    esNuevoUsuario: boolean,
  ): Promise<Result<LoginConGoogleResult, LoginConGoogleFallidoError>> {
    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());

    await this.sessions.crear({ userId, tokenHash, expiresAt });
    this.logger.debug('login-con-google: session emitted', {
      userId,
      expiresAt: expiresAt.toISOString(),
    });

    return Result.ok({ token, userId, expiresAt, esNuevoUsuario });
  }
}
