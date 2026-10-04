import type { Request } from 'express';

/**
 * esNavegacionDeNivelSuperior — guard anti-embed/CSRF para los `GET` de inicio
 * del login con Google (web). Nació para el extinto `GET /api/auth/demo`
 * (removido, ver la enmienda de ADR-046).
 *
 * Un `GET` público es embebible vía `<img>`, `<iframe>`, etc.: una página
 * maliciosa fuerza a CADA visitante a iniciar el flujo con la IP del propio
 * visitante, evadiendo el rate limiter por IP.
 *
 * `Sec-Fetch-Dest`/`Sec-Fetch-Mode` (Fetch Metadata, enviados por navegadores
 * modernos) distinguen navegación real de un sub-resource: una navegación
 * top-level trae `Sec-Fetch-Dest: document` y `Sec-Fetch-Mode: navigate`; un
 * `<img>`/`<iframe>` trae `dest: image|iframe` y/o `mode: no-cors|cors`.
 *
 * Fail-open cuando AMBOS headers están ausentes (clientes legacy que no los
 * envían) — gap residual documentado y aceptado, no bloqueamos tráfico legítimo de un navegador
 * viejo por un header que ni siquiera puede enviar.
 *
 * Prioriza `x-fwd-sec-fetch-*`: cuando el request llega por el proxy
 * same-origin del web (app.moneydiary.cl), undici descarta los `sec-fetch-*`
 * de la request salida, así que el proxy reenvía los valores REALES del
 * navegador bajo ese nombre custom (los setea server-side desde el request
 * entrante y descarta cualquier `x-fwd-*` del cliente — no forjables). Para una
 * navegación directa al API se usan los `sec-fetch-*` estándar.
 */
export function esNavegacionDeNivelSuperior(request: Request): boolean {
  const dest = headerValue(
    request.headers['x-fwd-sec-fetch-dest'] ??
      request.headers['sec-fetch-dest'],
  );
  const mode = headerValue(
    request.headers['x-fwd-sec-fetch-mode'] ??
      request.headers['sec-fetch-mode'],
  );

  if (dest !== undefined && dest !== 'document') {
    return false;
  }

  if (mode !== undefined && mode !== 'navigate') {
    return false;
  }

  return true;
}

/** Headers pueden llegar como string, array (repetidos) o undefined — normaliza al primer valor. */
function headerValue(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}
