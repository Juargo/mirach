const COOKIE_NAME = 'md_session';

/** Secure env-condicional — mirrors ApiKeyGuard's env-driven config style. */
function debeSerSecure(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

function construirCookie(valor: string, maxAgeSegundos: number): string {
  const atributos = [
    `${COOKIE_NAME}=${valor}`,
    `Max-Age=${maxAgeSegundos}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];

  if (debeSerSecure()) {
    atributos.push('Secure');
  }

  // Sin Domain= a propósito: cookie host-only, proxy-transparente (no hace
  // falta declarar el dominio explícitamente detrás de Vite/Vercel).
  return atributos.join('; ');
}

/**
 * serializarCookieSesion — cabecera `Set-Cookie` para la sesión (AUTH-01).
 *
 * `Max-Age` se calcula como los segundos entre `ahora` y `expiresAt` — para
 * una sesión recién creada (`expiresAt = calcularExpiracion(ahora)`) esto da
 * exactamente el TTL de 7 días (`TTL_SESION_MS`), sin duplicar esa constante
 * aquí (DRY — `duracion-sesion.ts` sigue siendo la única fuente del TTL).
 * `ahora` es inyectable para tests deterministas; por defecto usa el reloj real.
 */
export function serializarCookieSesion(
  token: string,
  expiresAt: Date,
  ahora: Date = new Date(),
): string {
  const maxAgeSegundos = Math.max(
    0,
    Math.round((expiresAt.getTime() - ahora.getTime()) / 1000),
  );
  return construirCookie(token, maxAgeSegundos);
}

/** limpiarCookieSesion — mismos atributos, `Max-Age=0` para borrar la cookie en el cliente. */
export function limpiarCookieSesion(): string {
  return construirCookie('', 0);
}
