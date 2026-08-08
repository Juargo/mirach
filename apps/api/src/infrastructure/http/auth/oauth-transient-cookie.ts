/** Nombre de la cookie transitoria OIDC — namespace distinto de `md_session` (design §3). */
export const OAUTH_COOKIE_NAME = 'md_oauth';

/**
 * Scoped a `/api/auth/google` (prefix-matchea `/api/auth/google` y
 * `/api/auth/google/callback` y nada más) — el browser ve estos paths
 * verbatim (el rewrite de Vercel es server-side y transparente), así que el
 * scoping funciona end to end (design §3 tabla).
 */
const OAUTH_COOKIE_PATH = '/api/auth/google';

/** 10 minutos — largo para un consent screen real, corto para que una cookie filtrada valga poco (design §3). */
const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

/** OauthTransientState — lo que viaja dentro de `md_oauth` mientras dura el round-trip OIDC (design §3). */
export interface OauthTransientState {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

function buildOauthCookie(
  valor: string,
  maxAgeSegundos: number,
  secure: boolean,
): string {
  const atributos = [
    `${OAUTH_COOKIE_NAME}=${valor}`,
    `Max-Age=${maxAgeSegundos}`,
    `Path=${OAUTH_COOKIE_PATH}`,
    'HttpOnly',
    // Lax, NOT Strict (unlike md_session): the browser sends this cookie on
    // Google's cross-site redirect back to us. Strict would be withheld on
    // that top-level navigation and every login would break (design §3).
    'SameSite=Lax',
  ];

  if (secure) {
    atributos.push('Secure');
  }

  // Sin Domain= a propósito: cookie host-only, misma postura que md_session.
  return atributos.join('; ');
}

/**
 * serializeOauthCookie — cabecera `Set-Cookie` para `md_oauth` (design §3).
 *
 * Valor: `base64url(JSON.stringify({state, nonce, codeVerifier}))`. Nombres
 * de campo explícitos (KISS) en vez de claves cortas — ~280 bytes, muy por
 * debajo del límite de 4 KB. Sin firma ni cifrado (design §3 — razonado ahí:
 * un atacante que puede setear una cookie en el dominio no necesita forjar
 * contenido, puede obtener una válida iniciando su propio flujo).
 */
export function serializeOauthCookie(
  payload: OauthTransientState,
  secure: boolean,
): string {
  const valor = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  return buildOauthCookie(valor, OAUTH_COOKIE_MAX_AGE_SECONDS, secure);
}

/** clearOauthCookie — mismos atributos, `Max-Age=0`. Se envía en TODA salida del callback (design §3). */
export function clearOauthCookie(secure: boolean): string {
  return buildOauthCookie('', 0, secure);
}

/**
 * parseOauthCookie — lee + decodifica `md_oauth` desde el header `Cookie`
 * crudo de la request. Parseo hand-rolled (mismo patrón que
 * `extraer-token.ts` — sin `cookie-parser`, decisión locked del proyecto).
 *
 * Fail-closed: CUALQUIER forma inesperada (ausente, vacía, base64url
 * inválido, JSON malformado, forma de objeto incorrecta, o no-objeto)
 * retorna `undefined` en vez de lanzar — un `md_oauth` corrupto o forjado
 * nunca debe tumbar el callback con una excepción cruda, solo fallar la
 * comparación de `state` río abajo (AUTH-15).
 */
export function parseOauthCookie(
  cookieHeader: string | undefined,
): OauthTransientState | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const par of cookieHeader.split(';')) {
    const igual = par.indexOf('=');
    if (igual === -1) continue;

    const nombre = par.slice(0, igual).trim();
    if (nombre !== OAUTH_COOKIE_NAME) continue;

    const valor = par.slice(igual + 1).trim();
    if (valor.length === 0) {
      return undefined;
    }
    return decodeOauthPayload(valor);
  }

  return undefined;
}

function decodeOauthPayload(raw: string): OauthTransientState | undefined {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return isOauthTransientState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isOauthTransientState(value: unknown): value is OauthTransientState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidato = value as Record<string, unknown>;
  return (
    typeof candidato.state === 'string' &&
    typeof candidato.nonce === 'string' &&
    typeof candidato.codeVerifier === 'string'
  );
}
