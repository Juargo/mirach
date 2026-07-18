import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * @CurrentUser() — param decorator que inyecta el `userId` validado por
 * `SessionGuard` (ver design.md §2). Los use cases de application siguen
 * recibiendo un `string` plano — nada de NestJS/Express se filtra más allá
 * de este decorator.
 *
 * Wireado en los 4 controllers de datos en Slice 2; se crea aquí porque es
 * parte de la infraestructura del guard chain.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest<Request>().userId;
  },
);
