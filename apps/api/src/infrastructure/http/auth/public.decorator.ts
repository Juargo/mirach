import { SetMetadata } from '@nestjs/common';

/**
 * Marca un handler o controller como público — el `ApiKeyGuard` lo deja pasar
 * sin exigir la API key. Se usa solo para endpoints que deben ser accesibles
 * sin credenciales (ej: el health check que Render consulta).
 *
 * Uso:
 *   @Public()
 *   @Get()
 *   health() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
