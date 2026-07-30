import type { RequestHandler } from 'express';

/**
 * createCorsMiddleware — CORS por allowlist de orígenes (hand-rolled, sin dep).
 *
 * CORS es política del NAVEGADOR: relaja el same-origin policy para permitir
 * que un origen distinto LEA la respuesta. NO protege la API — eso lo hacen la
 * api-key y la sesión. Por eso jamás se usa `*`, sino una allowlist explícita
 * (inyectada desde `env.CORS_ALLOWED_ORIGINS`, ADR-029).
 *
 * Para un origen permitido: refleja `Access-Control-Allow-Origin: <origin>` y
 * agrega `Vary: Origin` (la respuesta depende del header entrante → cacheable
 * por origen, no compartida entre orígenes). Responde el preflight `OPTIONS`
 * con 204 e informa métodos/headers permitidos. Para un origen fuera de la
 * lista —o un request sin `Origin` (server-to-server, el proxy same-origin del
 * web)— no agrega headers: el navegador bloquea la lectura cross-origin, que
 * es el comportamiento correcto.
 *
 * Se monta GLOBAL y ANTES de la api-key, para que el preflight `OPTIONS` (que
 * el navegador manda SIN credenciales) no choque con el 401 de la api-key.
 *
 * No setea `Access-Control-Allow-Credentials` a propósito (YAGNI): hoy el único
 * consumo cross-origin es `GET /version`, público y sin cookies. El día que un
 * cliente de navegador llame a `/api/*` cross-origin con sesión, se agrega acá
 * (junto con el origen específico — nunca `*` con credenciales).
 */
export function createCorsMiddleware(
  allowedOrigins: readonly string[],
): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.headers.origin;

    // Siempre declaramos que la respuesta varía por Origin —aunque no agreguemos
    // ACAO—: así ningún cache intermedio sirve la respuesta de un origen a otro.
    // `res.vary` APPENDea (no pisa un `Vary` que haya puesto otro middleware).
    res.vary('Origin');

    if (origin !== undefined && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PATCH, OPTIONS',
      );
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Preflight REAL: el navegador siempre manda `Access-Control-Request-Method`.
    // Se responde 204 vacío sin llegar a la ruta (si el origen no estaba
    // permitido, va sin ACAO → el navegador lo bloquea igual). Un OPTIONS que no
    // es preflight cae al ruteo normal, sin enmascarar un 404/405.
    if (
      req.method === 'OPTIONS' &&
      req.headers['access-control-request-method'] !== undefined
    ) {
      res.sendStatus(204);
      return;
    }

    next();
  };
}
