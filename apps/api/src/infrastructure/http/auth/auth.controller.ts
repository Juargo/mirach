import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../../../application/use-cases/crear-demo.use-case';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { PublicSession } from './session-public.decorator';
import { CurrentUser } from './current-user.decorator';
import { LoginRateLimiter } from './login-rate-limiter';
import { DemoRateLimiter } from './demo-rate-limiter';
import { DemoCleanupService } from './demo-cleanup.service';
import { getClientIp } from './client-ip';
import { extractToken } from './extraer-token';
import { serializeSessionCookie, clearSessionCookie } from './cookie';

/** LoginResponseDto — body de éxito de POST /login (AUTH-01 revised). */
export interface LoginResponseDto {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: string;
}

/**
 * MeDto — body de éxito de GET /me (AUTH-09). Sin hash, sin token.
 * `esDemo` distingue una cuenta demo (`email: null`) de una real (DEMO-AUTH-05).
 */
export interface MeDto {
  readonly userId: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}

/**
 * AuthController — login/logout/identidad (route base `api/auth`).
 *
 * `POST /login` y `POST /logout` están marcados `@PublicSession()`: siguen
 * exigiendo `x-api-key` (ApiKeyGuard) pero NO una sesión ya validada.
 * `GET /me` no lleva marcador — `SessionGuard` la protege como cualquier
 * endpoint de datos (AUTH-09).
 */
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly obtenerIdentidadUseCase: ObtenerIdentidadUseCase,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly demoRateLimiter: DemoRateLimiter,
    private readonly crearDemoUseCase: CrearDemoUseCase,
    private readonly demoCleanupService: DemoCleanupService,
    private readonly validarSesionUseCase: ValidarSesionUseCase,
  ) {}

  @PublicSession()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() body: { email?: unknown; password?: unknown },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const ip = getClientIp(req);

    if (this.rateLimiter.isBlocked(ip, email)) {
      // Scrubbed: path + a coarse marker only — NEVER the email/password.
      this.logger.warn(`Login rechazado (rate-limited) — path=${req.path}`);
      throw new HttpException(
        'Demasiados intentos. Espera unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Record the attempt OPTIMISTICALLY, before awaiting the use case — not
    // after. Recording only on failure (post-await) is a check-then-act race:
    // N concurrent requests would all pass isBlocked() before any of them
    // calls recordFailure(), letting all N through regardless of the budget.
    // A successful login clears this pre-recorded attempt via reset()
    // below, so it never ends up double-counted or left counted.
    this.rateLimiter.recordFailure(ip, email);

    const result = await this.runUseCase(
      () => this.loginUseCase.execute({ emailRaw: email, password }),
      'Error inesperado durante el login',
    );

    if (result.isFail()) {
      // Scrubbed: path only — NEVER the email/password.
      this.logger.warn(`Login rechazado (credenciales inválidas) — path=${req.path}`);
      throw new UnauthorizedException(result.getError().message);
    }

    this.rateLimiter.reset(ip, email);
    const { token, userId, expiresAt } = result.getValue();
    res.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAt));

    return { token, userId, expiresAt: expiresAt.toISOString() };
  }

  @PublicSession()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = extractToken(req);

    try {
      await this.logoutUseCase.execute({ token });
    } catch (err) {
      // LogoutUseCase.execute never fails per its Result<void, never> contract,
      // but the underlying repository may throw on an infra failure. Logout
      // stays robust — the cookie is cleared client-side regardless.
      this.logger.error(
        'Error inesperado durante el logout',
        err instanceof Error ? err.stack : String(err),
      );
    }

    res.setHeader('Set-Cookie', clearSessionCookie());
  }

  @Get('me')
  async me(@CurrentUser() userId: string): Promise<MeDto> {
    const result = await this.runUseCase(
      () => this.obtenerIdentidadUseCase.execute({ userId }),
      'Error inesperado al obtener la identidad',
    );

    if (result.isFail()) {
      throw new UnauthorizedException(result.getError().message);
    }

    const identidad = result.getValue();
    return { userId: identidad.userId, email: identidad.email, esDemo: identidad.esDemo };
  }

  /**
   * GET /api/auth/demo — crea (o reutiliza) una cuenta demo (DEMO-AUTH-01).
   *
   * `@PublicSession()`: sigue exigiendo `x-api-key` pero no una sesión ya
   * validada — el visitante llega anónimo.
   *
   * Orden (design.md §Data Flow):
   *   1. DEMO-AUTH-03/04: si ya trae un token de sesión demo válido, lo
   *      reutiliza y redirige sin crear nada nuevo. Un token inválido/
   *      expirado, o de un usuario NO demo, cae al flujo normal (abajo).
   *   2. Rate limit por IP (DEMO-AUTH-02) → 429 si excede 3/hora.
   *   3. Limpieza perezosa de demos expirados (DEMO-CLN-02), ANTES de crear.
   *   4. `CrearDemoUseCase` → cookie de sesión → 302 a `/`.
   *
   * Redirige a un path relativo (`/`), no a un dominio absoluto — así
   * funciona igual en cualquier entorno (local/staging/producción) sin
   * hardcodear `app.moneydiary.cl`.
   */
  @PublicSession()
  @Get('demo')
  async demo(@Req() req: Request, @Res() res: Response): Promise<void> {
    const tokenExistente = extractToken(req);

    if (tokenExistente !== undefined && (await this.esSesionDemoValida(tokenExistente))) {
      res.redirect(HttpStatus.FOUND, '/');
      return;
    }

    const ip = getClientIp(req);

    if (this.demoRateLimiter.isBlocked(ip)) {
      this.logger.warn(`Demo rechazado (rate-limited) — path=${req.path}`);
      throw new HttpException(
        'Demasiadas solicitudes de demo. Intenta más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.demoRateLimiter.recordFailure(ip);

    await this.runUseCase(
      () => this.demoCleanupService.borrarExpirados(),
      'Error al limpiar cuentas demo expiradas',
    );

    const { token, expiresAt } = await this.runUseCase(
      () => this.crearDemoUseCase.execute(),
      'Error inesperado al crear la cuenta demo',
    );

    res.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAt));
    res.redirect(HttpStatus.FOUND, '/');
  }

  /** DEMO-AUTH-03/04 — true solo si el token es válido Y pertenece a un usuario demo. */
  private async esSesionDemoValida(token: string): Promise<boolean> {
    const validado = await this.validarSesionUseCase.execute({ token });
    if (validado.isFail()) {
      return false;
    }

    const identidad = await this.obtenerIdentidadUseCase.execute({
      userId: validado.getValue().userId,
    });

    return identidad.isOk() && identidad.getValue().esDemo;
  }

  /**
   * runUseCase — DRY: envuelve la llamada a un use case, logueando y
   * traduciendo a 500 cualquier excepción NO controlada (fallo de
   * infraestructura), sin ocultar el `Result<T,E>` de negocio que el propio
   * use case retorna. `login` y `me` comparten este wrapper; `logout` NO lo
   * usa porque debe seguir siendo robusto (nunca relanzar, la cookie se
   * limpia igual).
   */
  private async runUseCase<T>(fn: () => Promise<T>, context: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(context, err instanceof Error ? err.stack : String(err));
      throw new InternalServerErrorException('Error inesperado. Intenta nuevamente.');
    }
  }
}
