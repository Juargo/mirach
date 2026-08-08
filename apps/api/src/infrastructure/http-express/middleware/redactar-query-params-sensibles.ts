/**
 * Nombres de query params cuyo VALOR nunca debe llegar a los logs (design
 * §6.3(a), AUTH-18). Cubre el intercambio OIDC completo (`code`/`state`/
 * `id_token`/`code_verifier`) más los nombres genéricos de token que otros
 * flujos pudieran usar a futuro — la función es deliberadamente genérica,
 * no específica de Google, para proteger cualquier endpoint futuro que
 * reciba un secreto por query string.
 */
export const PARAMS_SENSIBLES = new Set([
  'code',
  'state',
  'id_token',
  'access_token',
  'refresh_token',
  'token',
  'code_verifier',
]);

const VALOR_REDACTADO = '[REDACTED]';

/**
 * redactarQueryParamsSensibles — reemplaza el VALOR de cada query param
 * sensible por `[REDACTED]`, preservando el resto de la URL intacto
 * (pathname, otros params, orden). Pura, sin dependencias — usada como
 * `serializers.req` en `createRequestLoggerMiddleware` (C1.10) porque
 * `pino-http` serializa `req.url` completo, INCLUYENDO el query string, y
 * `SENSITIVE_REDACT_PATHS` (pino-logger.ts) no puede alcanzar valores
 * dentro de un único string — solo direcciona por clave de objeto.
 *
 * Nunca lanza: una URL adversarial/malformada retorna el input sin tocar
 * (fail-closed en el sentido de "no crashear el request logging", no en el
 * de "no loguear" — si no se puede parsear, tampoco se puede saber qué
 * redactar, así que el string original pasa intacto en ese caso extremo en
 * vez de tirar abajo el middleware).
 */
export function redactarQueryParamsSensibles(url: string): string {
  const indiceQuery = url.indexOf('?');
  if (indiceQuery === -1) {
    return url;
  }

  const pathname = url.slice(0, indiceQuery);
  const queryString = url.slice(indiceQuery + 1);

  if (queryString.length === 0) {
    return url;
  }

  try {
    const params = new URLSearchParams(queryString);

    for (const key of params.keys()) {
      if (PARAMS_SENSIBLES.has(key)) {
        params.set(key, VALOR_REDACTADO);
      }
    }

    return `${pathname}?${params.toString()}`;
  } catch {
    return url;
  }
}

/**
 * redactarQueryObjectSensible — mismo criterio que
 * `redactarQueryParamsSensibles`, pero sobre el objeto `query` YA PARSEADO
 * por Express (`req.query`).
 *
 * Necesario porque `pino-http`'s default `req` serializer (`pino-std-serializers`)
 * emite DOS campos independientes con la misma información: `url` (el
 * string crudo, cubierto por `redactarQueryParamsSensibles`) Y `query` (el
 * objeto ya parseado) — redactar solo `url` deja `query` filtrando el
 * mismo secreto por otra puerta (descubierto al verificar empíricamente el
 * shape real emitido, no asumido del design). No muta el input.
 */
export function redactarQueryObjectSensible(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const resultado: Record<string, unknown> = { ...query };

  for (const key of Object.keys(resultado)) {
    if (PARAMS_SENSIBLES.has(key)) {
      resultado[key] = VALOR_REDACTADO;
    }
  }

  return resultado;
}
