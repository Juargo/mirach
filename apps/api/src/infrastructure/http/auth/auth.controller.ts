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
import { PublicSession } from './session-public.decorator';
import { CurrentUser } from './current-user.decorator';
import { LoginRateLimiter } from './login-rate-limiter';
import { obtenerIpCliente } from './client-ip';
import { extraerToken } from './extraer-token';
import { serializarCookieSesion, limpiarCookieSesion } from './cookie';

/** LoginResponseDto — body de éxito de POST /login (AUTH-01 revised). */
export interface LoginResponseDto {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: string;
}

/** MeDto — body de éxito de GET /me (AUTH-09). Sin hash, sin token. */
export interface MeDto {
  readonly userId: string;
  readonly email: string;
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
    const ip = obtenerIpCliente(req);

    if (this.rateLimiter.estaBloqueado(ip, email)) {
      throw new HttpException(
        'Demasiados intentos. Espera unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let result: Awaited<ReturnType<LoginUseCase['execute']>>;
    try {
      result = await this.loginUseCase.execute({ emailRaw: email, password });
    } catch (err) {
      this.logger.error(
        'Error inesperado durante el login',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Error inesperado. Intenta nuevamente.');
    }

    if (result.isFail()) {
      this.rateLimiter.registrarFallo(ip, email);
      throw new UnauthorizedException(result.getError().message);
    }

    this.rateLimiter.resetear(ip, email);
    const { token, userId, expiresAt } = result.getValue();
    res.setHeader('Set-Cookie', serializarCookieSesion(token, expiresAt));

    return { token, userId, expiresAt: expiresAt.toISOString() };
  }

  @PublicSession()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = extraerToken(req);

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

    res.setHeader('Set-Cookie', limpiarCookieSesion());
  }

  @Get('me')
  async me(@CurrentUser() userId: string): Promise<MeDto> {
    let result: Awaited<ReturnType<ObtenerIdentidadUseCase['execute']>>;
    try {
      result = await this.obtenerIdentidadUseCase.execute({ userId });
    } catch (err) {
      this.logger.error(
        'Error inesperado al obtener la identidad',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Error inesperado. Intenta nuevamente.');
    }

    if (result.isFail()) {
      throw new UnauthorizedException(result.getError().message);
    }

    const identidad = result.getValue();
    return { userId: identidad.userId, email: identidad.email };
  }
}
