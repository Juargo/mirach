import { Result } from '../../shared/result';
import { Email } from '../../domain/value-objects/email';
import { calcularExpiracion } from '../../domain/value-objects/duracion-sesion';
import { LoginConAppleFallidoError } from '../../domain/errors/login-con-apple-fallido.error';
import {
  IIdentidadAppleRepository,
  UsuarioApple,
} from '../ports/identidad-apple-repository.port';
import { IdentidadApple } from '../ports/verificador-identidad-apple.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { ILogger } from '../ports/logger.port';
import { IClienteAppleAuth } from '../ports/cliente-apple-auth.port';
import { IRefreshTokenAppleRepository } from '../ports/refresh-token-apple-repository.port';
import { LoginUseCaseResult } from './login.use-case';

/**
 * LoginConAppleResult — `LoginUseCaseResult` + `esNuevoUsuario`, SOLO
 * server-side (el body HTTP es idéntico para login y alta, no enumeración):
 * el caller lo usa para no resetear el rate limiter en un alta.
 */
export interface LoginConAppleResult extends LoginUseCaseResult {
  readonly esNuevoUsuario: boolean;
}

/** Largo máximo de `nombre` (mismo tope que `PATCH /api/perfil`). */
const NOMBRE_MAX = 80;
const NOMBRE_POR_DEFECTO = 'Usuario';

/**
 * LoginConAppleUseCase — resolución de identidad Apple + emisión de sesión.
 * Gemelo de `LoginConGoogleUseCase`; la ruta HTTP ya verificó el identity
 * token (firma, `iss`, `aud`, `exp`, nonce) antes de invocarlo.
 *
 * Orden: (1) por `appleSub` — la identidad de Apple es SIEMPRE el `sub`, nunca
 * el email; (2) si no hay match, el email del token: sin email no hay cuenta
 * que crear ni enlazar; (3) email verificado; (4) enlace por email SOLO si no
 * es un relay privado; (5) alta.
 *
 * Email obligatorio para una cuenta nueva: Apple entrega el email (y el
 * nombre) únicamente en la PRIMERA autorización, y solo si la app pidió el
 * scope `email`. Si una cuenta nueva llega sin email se falla cerrado
 * (`email-ausente`, mismo 401 que cualquier otro fallo) y se loguea la razón:
 * la app debe solicitar el scope. Un usuario ya registrado no necesita email
 * en los logins siguientes — resuelve por `appleSub` en el paso 1.
 *
 * Relay privado ("Ocultar mi correo"): es una dirección de Apple que reenvía
 * al usuario. Sirve para crear la cuenta, pero no prueba que la persona sea
 * dueña de otra cuenta con ese email, así que nunca se enlaza por él (sería
 * un primitivo de account takeover si alguien registrara un relay que
 * colisione). Guarda anti-takeover del enlace por email real: la fila no debe
 * tener ya OTRO `appleSub`.
 *
 * `nombre` viene del cuerpo de la primera autorización (no está en el token);
 * si falta, la parte local del email (o "Usuario" para un relay, cuya parte
 * local es ruido). El usuario puede corregirlo en `PATCH /api/perfil`.
 *
 * Todas las ramas de fallo colapsan al mismo `LoginConAppleFallidoError`.
 * Redacción (ADR-013): nunca se loguea sub, email, nombre ni tokens.
 *
 * `authorizationCode` (opcional, T4): tras una resolución EXITOSA se canjea en
 * Apple y el refresh token se guarda cifrado, para poder revocarlo al eliminar
 * la cuenta. Es best-effort: cualquier fallo (Apple caído, código vencido o
 * ya usado, BD) solo emite un `warn` con el motivo y el userId; el login ya
 * tuvo éxito y no se ve afectado. Sin code, o con el intercambio apagado
 * (sin credenciales de Apple), no se hace nada. Nunca se loguea el code ni el
 * refresh token.
 */
export class LoginConAppleUseCase {
  constructor(
    private readonly identidades: IIdentidadAppleRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly logger: ILogger,
    private readonly clienteApple?: IClienteAppleAuth,
    private readonly refreshTokens?: IRefreshTokenAppleRepository,
  ) {}

  async execute(
    identidad: IdentidadApple,
    nombre?: string | null,
    authorizationCode?: string | null,
  ): Promise<Result<LoginConAppleResult, LoginConAppleFallidoError>> {
    const resultado = await this.resolverIdentidad(identidad, nombre);

    if (resultado.isOk()) {
      await this.guardarRefreshToken(
        resultado.getValue().userId,
        authorizationCode,
      );
    }

    return resultado;
  }

  /** Canje del code + guardado cifrado del refresh token; nunca lanza ni cambia el login. */
  private async guardarRefreshToken(
    userId: string,
    authorizationCode: string | null | undefined,
  ): Promise<void> {
    const code = authorizationCode?.trim() ?? '';

    if (code === '' || !this.clienteApple || !this.refreshTokens) {
      return;
    }

    try {
      const canje = await this.clienteApple.intercambiarCodigo(code);

      if (canje.isFail()) {
        const { motivo, detalle } = canje.getError();
        this.logger.warn(
          'login-con-apple: canje del authorizationCode fallido',
          {
            userId,
            motivo,
            ...(detalle !== undefined && { detalle }),
          },
        );
        return;
      }

      await this.refreshTokens.guardar(userId, canje.getValue());
      this.logger.debug('login-con-apple: refresh token guardado', { userId });
    } catch (err) {
      this.logger.warn('login-con-apple: canje del authorizationCode fallido', {
        userId,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }

  private async resolverIdentidad(
    identidad: IdentidadApple,
    nombre?: string | null,
  ): Promise<Result<LoginConAppleResult, LoginConAppleFallidoError>> {
    const porSub = await this.identidades.buscarPorAppleSub(identidad.sub);
    this.logger.debug('login-con-apple: appleSub lookup', {
      found: porSub !== null,
    });

    if (porSub !== null) {
      return this.emitirSesion(porSub.userId, false);
    }

    if (identidad.email === null) {
      this.logger.warn(
        'login-con-apple: cuenta nueva sin email — la app debe pedir el scope "email" en la primera autorización',
      );
      return Result.fail(new LoginConAppleFallidoError('email-ausente'));
    }

    const emailResult = Email.crear(identidad.email);

    if (emailResult.isFail()) {
      return Result.fail(new LoginConAppleFallidoError('email-invalido'));
    }

    if (!identidad.emailVerificado) {
      return Result.fail(new LoginConAppleFallidoError('email-no-verificado'));
    }

    const email = emailResult.getValue();

    if (identidad.emailPrivado) {
      return this.crearCuenta(identidad, email, nombre);
    }

    const porEmail = await this.identidades.buscarPorEmail(email);
    this.logger.debug('login-con-apple: email lookup', {
      found: porEmail !== null,
    });

    if (porEmail === null) {
      return this.crearCuenta(identidad, email, nombre);
    }

    return this.resolverFilaPorEmail(identidad, porEmail, false);
  }

  /**
   * Una fila existente ocupa el email de la identidad. Tres desenlaces:
   * (a) la fila ya lleva ESTE `appleSub` — el ganador de una carrera de alta
   * concurrente commiteó entre nuestro lookup por sub y este por email — es
   * la misma identidad: sesión; (b) lleva OTRO `appleSub` — sobrescribirlo
   * sería un takeover, se rechaza; (c) no lleva ninguno — enlace condicional.
   */
  private async resolverFilaPorEmail(
    identidad: IdentidadApple,
    porEmail: UsuarioApple,
    esNuevoUsuario: boolean,
  ): Promise<Result<LoginConAppleResult, LoginConAppleFallidoError>> {
    if (porEmail.appleSub === identidad.sub) {
      return this.emitirSesion(porEmail.userId, esNuevoUsuario);
    }

    // El lookup por sub ya falló: un `appleSub` no-null acá es de OTRA
    // identidad Apple. Sobrescribirlo sería un takeover — se rechaza.
    if (porEmail.appleSub !== null) {
      return Result.fail(
        new LoginConAppleFallidoError('ya-vinculado-a-otra-identidad'),
      );
    }

    const vinculado = await this.identidades.vincularAppleSub(
      porEmail.userId,
      identidad.sub,
    );
    this.logger.debug('login-con-apple: identity link outcome', { vinculado });

    if (!vinculado) {
      return Result.fail(
        new LoginConAppleFallidoError('link-perdio-la-carrera'),
      );
    }

    return this.emitirSesion(porEmail.userId, esNuevoUsuario);
  }

  /**
   * Alta. Si pierde la carrera (P2002 → `null`, sea por `appleSub` o por
   * `emailBlindIndex`) re-resuelve: primero por `appleSub` (doble submit de
   * la misma identidad); si no aparece y el email es real, por email con las
   * mismas reglas de enlace y guarda anti-takeover del flujo normal (una
   * cuenta creada por otra vía puede haber ocupado el email). Un relay nunca
   * se busca ni se enlaza por email. Cualquier otro caso colapsa al error
   * genérico. `esNuevoUsuario`
   * es `true` en toda salida OK, incluida la rama "ganador": esta petición SÍ
   * intentó crear, así que sigue contando contra el rate limiter.
   */
  private async crearCuenta(
    identidad: IdentidadApple,
    email: Email,
    nombre: string | null | undefined,
  ): Promise<Result<LoginConAppleResult, LoginConAppleFallidoError>> {
    const nuevoUserId = await this.identidades.crearDesdeApple({
      email,
      appleSub: identidad.sub,
      nombre: resolverNombre(nombre, email, identidad.emailPrivado),
    });

    if (nuevoUserId !== null) {
      this.logger.info('login-con-apple: usuario creado', {
        userId: nuevoUserId,
      });
      return this.emitirSesion(nuevoUserId, true);
    }

    this.logger.debug('login-con-apple: signup outcome', { creado: false });

    const ganador = await this.identidades.buscarPorAppleSub(identidad.sub);
    this.logger.debug('login-con-apple: signup race retry lookup', {
      found: ganador !== null,
    });

    if (ganador !== null) {
      return this.emitirSesion(ganador.userId, true);
    }

    if (!identidad.emailPrivado) {
      const porEmail = await this.identidades.buscarPorEmail(email);
      this.logger.debug('login-con-apple: signup race email lookup', {
        found: porEmail !== null,
      });

      if (porEmail !== null) {
        return this.resolverFilaPorEmail(identidad, porEmail, true);
      }
    }

    return Result.fail(
      new LoginConAppleFallidoError('creacion-perdio-la-carrera'),
    );
  }

  /** Emisión de sesión byte-idéntica a `LoginUseCase`. */
  private async emitirSesion(
    userId: string,
    esNuevoUsuario: boolean,
  ): Promise<Result<LoginConAppleResult, LoginConAppleFallidoError>> {
    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracion(this.reloj.ahora());

    await this.sessions.crear({ userId, tokenHash, expiresAt });
    this.logger.debug('login-con-apple: session emitted', {
      userId,
      expiresAt: expiresAt.toISOString(),
    });

    return Result.ok({ token, userId, expiresAt, esNuevoUsuario });
  }
}

function resolverNombre(
  nombre: string | null | undefined,
  email: Email,
  emailPrivado: boolean,
): string {
  const delCliente = nombre?.trim() ?? '';
  const candidato =
    delCliente !== ''
      ? delCliente
      : emailPrivado
        ? NOMBRE_POR_DEFECTO
        : email.valor.split('@')[0];

  return candidato.slice(0, NOMBRE_MAX);
}
