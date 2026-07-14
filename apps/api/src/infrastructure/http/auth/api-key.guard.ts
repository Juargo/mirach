import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * ApiKeyGuard — protección mínima de acceso para la fase mono-usuario (MVP mobile).
 *
 * Exige el header `x-api-key` en cada request y lo compara — en tiempo constante —
 * contra `process.env.API_KEY`. Es una medida rápida y suficiente para no exponer
 * los datos financieros del único usuario al desplegar la API en Render; NO
 * reemplaza autenticación real por usuario (queda como US futura).
 *
 * Diseño fail-closed (seguro por defecto):
 *   - Si `API_KEY` no está configurada en el entorno → 500 y se rechaza TODO.
 *     Así la API no puede quedar accidentalmente desplegada sin protección.
 *   - Header ausente o key incorrecta → 401.
 *   - Endpoints marcados con @Public() (ej: health check) se dejan pasar.
 *
 * No refleja jamás el valor recibido en la respuesta (evita filtrado por eco).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private static readonly HEADER = 'x-api-key';
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const expected = process.env.API_KEY;
    if (!expected || expected.length < 16) {
      // Fail-closed: sin una API key robusta configurada, no se atiende nada.
      this.logger.error(
        'API_KEY no configurada (o demasiado corta). Se rechazan todas las peticiones protegidas.',
      );
      throw new InternalServerErrorException('Servicio mal configurado.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.header(ApiKeyGuard.HEADER);

    if (!received || !ApiKeyGuard.safeEqual(received, expected)) {
      throw new UnauthorizedException('API key inválida o ausente.');
    }

    return true;
  }

  /** Comparación en tiempo constante — evita timing attacks sobre la key. */
  private static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
