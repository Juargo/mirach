/** Nombre de la cookie de sesión — única fuente (DRY), reusado por `extraer-token.ts`. */
export const COOKIE_NAME = 'md_session';

/** Secure env-condicional — mirrors ApiKeyGuard's env-driven config style. */
function shouldBeSecure(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

function buildCookie(valor: string, maxAgeSegundos: number): string {
  const atributos = [
    `${COOKIE_NAME}=${valor}`,
    `Max-Age=${maxAgeSegundos}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];

  if (shouldBeSecure()) {
    atributos.push('Secure');
  }

  // Sin Domain= a propósito: cookie host-only, proxy-transparente (no hace
  // falta declarar el dominio explícitamente detrás de Vite/Vercel).
  return atributos.join('; ');
}

/**
 * serializeSessionCookie — cabecera `Set-Cookie` para la sesión (AUTH-01).
 *
 * `Max-Age` se calcula como los segundos entre `ahora` y `expiresAt` — para
 * una sesión recién creada (`expiresAt = calcularExpiracion(ahora)`) esto da
 * exactamente el TTL de 7 días (`TTL_SESION_MS`), sin duplicar esa constante
 * aquí (DRY — `duracion-sesion.ts` sigue siendo la única fuente del TTL).
 * `ahora` es inyectable para tests deterministas; por defecto usa el reloj real.
 */
export function serializeSessionCookie(
  token: string,
  expiresAt: Date,
  ahora: Date = new Date(),
): string {
  const maxAgeSegundos = Math.max(
    0,
    Math.round((expiresAt.getTime() - ahora.getTime()) / 1000),
  );
  return buildCookie(token, maxAgeSegundos);
}

/** clearSessionCookie — mismos atributos, `Max-Age=0` para borrar la cookie en el cliente. */
export function clearSessionCookie(): string {
  return buildCookie('', 0);
}
