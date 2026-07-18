import { SetMetadata } from '@nestjs/common';

/**
 * Marca un handler o controller como exento de `SessionGuard` — SIGUE
 * exigiendo `x-api-key` (`ApiKeyGuard`), solo se salta la validación de
 * sesión. Distinto de `@Public()`, que se salta AMBOS guards.
 *
 * Uso: `/api/auth/login` y `/api/auth/logout` (AC-07) — no hay sesión todavía
 * cuando se llama a login, y logout debe funcionar incluso con una sesión ya
 * inválida/expirada.
 *
 *   @PublicSession()
 *   @Post('login')
 *   login() { ... }
 */
export const IS_SESSION_PUBLIC_KEY = 'isSessionPublic';
export const PublicSession = () => SetMetadata(IS_SESSION_PUBLIC_KEY, true);
