import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * link-intent — firma/verifica el `link` que viaja dentro de `md_oauth`
 * cuando el flujo OIDC es un LINK explícito, no un login (US-041, design
 * §1/Q1, D-01).
 *
 * Plain functions tomando la key — no una clase, no un port (D-01): la
 * integridad de la cookie es una preocupación de TRANSPORTE, la capa
 * application nunca aprende que existe un MAC. La ruta firma/verifica;
 * `VincularGoogleUseCase` recibe un `userId` en el que puede confiar, igual
 * que cualquier otro use case lo recibe de `sessionMiddleware`.
 */

/** Lo que viaja dentro de `md_oauth.link` — el userId destino y su MAC. */
export interface LinkIntent {
  readonly userId: string;
  readonly mac: string; // base64url de 32 bytes (43 chars)
}

/**
 * Mensaje canónico del MAC. Length-prefixed, NO `${state}.${userId}`: con un
 * separador simple, `("a.b","c")` y `("a","b.c")` producen el MISMO mensaje.
 * Hoy eso no es explotable (`state` lo genera `openid-client` y `userId`
 * sale de la sesión — ninguno lo controla el atacante), pero esa seguridad
 * depende del alfabeto de `state`, que es una propiedad de una librería de
 * terceros que este repo no fija ni testea. Un prefijo de largo hace la
 * codificación inyectiva por construcción, cuesta una línea y deja de
 * depender de nada externo (design §1/Q1b).
 */
function mensajeLinkIntent(state: string, userId: string): Buffer {
  return Buffer.from(
    `${Buffer.byteLength(state, 'utf8')}:${state}:${Buffer.byteLength(userId, 'utf8')}:${userId}`,
    'utf8',
  );
}

/**
 * firmarLinkIntent — llamado ÚNICAMENTE desde la ruta de iniciación
 * (`POST /api/perfil/google/vincular`), después de que el use case confirmó
 * sesión + no-demo + password correcta (design §4.1, G1-G4). La aplicación
 * nunca ve esta función: solo la ruta HTTP la importa (D-01, G3).
 */
export function firmarLinkIntent(
  key: Buffer,
  state: string,
  userId: string,
): LinkIntent {
  const mac = createHmac('sha256', key)
    .update(mensajeLinkIntent(state, userId))
    .digest('base64url');
  return { userId, mac };
}

/**
 * verificarLinkIntent — `state` es el que la ruta YA validó contra el query
 * param (nunca el de la cookie sin validar). Fail-closed: cualquier forma
 * inesperada ⇒ `false`, nunca un throw (design §1/Q1c).
 *
 * Dos traps, ambos cubiertos acá:
 * - `timingSafeEqual` LANZA si los largos de los buffers difieren — el
 *   chequeo de largo va PRIMERO y ES el gate real (retorna `false`), no una
 *   formalidad salteable.
 * - `Buffer.from(x, 'base64url')` NO lanza con basura no-base64url: descarta
 *   los caracteres inválidos y devuelve un buffer MÁS CORTO — el mismo
 *   chequeo de largo de arriba también cubre este caso.
 */
export function verificarLinkIntent(
  key: Buffer,
  state: string,
  intent: LinkIntent,
): boolean {
  const esperado = createHmac('sha256', key)
    .update(mensajeLinkIntent(state, intent.userId))
    .digest();
  const recibido = Buffer.from(intent.mac, 'base64url');

  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}
