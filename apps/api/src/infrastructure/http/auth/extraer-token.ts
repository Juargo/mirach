import type { Request } from 'express';

const COOKIE_NAME = 'md_session';
const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * extraerToken — resuelve el token de sesión desde cookie O Bearer (AUTH-05).
 *
 * Única fuente de la regla de precedencia (DRY): cookie `md_session` primero;
 * si está presente y no vacía, el header `Authorization` se IGNORA por
 * completo (incluso si trae basura). Si no hay cookie, cae a
 * `Authorization: Bearer <token>`. Sin ninguno de los dos → `undefined`.
 *
 * Función pura (`request → string | undefined`, sin I/O) — se testea sin
 * levantar una sesión real y la reutiliza `SessionGuard`.
 */
export function extraerToken(request: Request): string | undefined {
  const desdeCookie = leerCookieSesion(request.headers.cookie);
  if (desdeCookie !== undefined) {
    return desdeCookie;
  }

  return leerBearer(request.headers.authorization);
}

/** Parseo hand-rolled de UNA cookie conocida — no se usa `cookie-parser` (decisión locked). */
function leerCookieSesion(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const par of cookieHeader.split(';')) {
    const igual = par.indexOf('=');
    if (igual === -1) continue;

    const nombre = par.slice(0, igual).trim();
    if (nombre !== COOKIE_NAME) continue;

    const valor = par.slice(igual + 1).trim();
    return valor.length > 0 ? valor : undefined;
  }

  return undefined;
}

function leerBearer(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = BEARER_PATTERN.exec(authorizationHeader);
  return match ? match[1] : undefined;
}
