/**
 * duracion-sesion — funciones de dominio puras (no VO, no estado).
 *
 * Fuente única de verdad para el TTL absoluto de sesión (7 días, AUTH-06).
 * Puras (sin `Date.now()` interno) para que los tests puedan fijar `ahora`
 * con un reloj determinístico — ninguna función aquí toca el reloj real.
 */

/** TTL absoluto de sesión: 7 días, en milisegundos. */
export const TTL_SESION_MS = 7 * 24 * 60 * 60 * 1000;

/** Calcula el instante de expiración dado un instante base. Sin renovación deslizante. */
export function calcularExpiracion(ahora: Date): Date {
  return new Date(ahora.getTime() + TTL_SESION_MS);
}

/**
 * Una sesión cuyo `expiresAt` ya pasó (o coincide exactamente) se trata como
 * ausente (AUTH-06) — el límite es inclusivo del instante de expiración.
 */
export function estaExpirada(expiresAt: Date, ahora: Date): boolean {
  return ahora.getTime() >= expiresAt.getTime();
}

/**
 * Sesión de una cuenta anónima (ADR-013): 365 días, renovables con el uso.
 * Una cuenta anónima no puede volver a iniciar sesión, así que perder la
 * sesión es perder los datos; por eso dura más y se extiende sola.
 */
export const TTL_SESION_ANONIMA_MS = 365 * 24 * 60 * 60 * 1000;

/** Como máximo una escritura de renovación al día por sesión. */
const INTERVALO_RENOVACION_MS = 24 * 60 * 60 * 1000;

export function calcularExpiracionAnonima(ahora: Date): Date {
  return new Date(ahora.getTime() + TTL_SESION_ANONIMA_MS);
}

/**
 * `true` cuando ya se consumió más de un día desde la última renovación (o
 * desde la emisión). No decide si la sesión sigue viva: eso es `estaExpirada`.
 */
export function debeRenovarSesionAnonima(
  expiresAt: Date,
  ahora: Date,
): boolean {
  const restante = expiresAt.getTime() - ahora.getTime();

  return restante < TTL_SESION_ANONIMA_MS - INTERVALO_RENOVACION_MS;
}
