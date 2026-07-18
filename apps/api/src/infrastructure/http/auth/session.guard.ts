import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_SESSION_PUBLIC_KEY } from './session-public.decorator';
import { extraerToken } from './extraer-token';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';

/**
 * SessionGuard — segundo guard global (AC-06), corre DESPUÉS de `ApiKeyGuard`.
 *
 * Exige una sesión válida — cookie `md_session` O `Authorization: Bearer`
 * (precedencia de cookie, AUTH-05) — en cada request salvo las marcadas
 * `@Public()` (se salta ambos guards) o `@PublicSession()` (solo este guard).
 * El mismo `ValidarSesionUseCase` valida ambos transportes: hashing, lookup,
 * expiración y revocación son idénticos sin importar de dónde vino el token.
 *
 * Éxito → escribe `request.userId` (ver `@CurrentUser()`, Slice 2).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly validarSesion: ValidarSesionUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isSessionPublic = this.reflector.getAllAndOverride<boolean>(
      IS_SESSION_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isSessionPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extraerToken(request);

    if (token === undefined) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    const result = await this.validarSesion.execute({ token });

    if (result.isFail()) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    request.userId = result.getValue().userId;
    return true;
  }
}
