import type { Request } from 'express';

/**
 * esNavegacionDeNivelSuperior — guard anti-embed/CSRF para `GET /api/auth/demo`
 * (judgment-day FIX crítico).
 *
 * El endpoint DEBE seguir siendo un `GET` alcanzable por navegación top-level
 * (el link del landing lo abre en una pestaña nueva) — la postura elegida es
 * "hardening sin romper el link", NO migrar a POST. Pero un `GET` público es
 * embebible vía `<img src="/api/auth/demo">`, `<iframe>`, etc.: una página
 * maliciosa fuerza a CADA visitante a crear una cuenta demo con la IP del
 * propio visitante, evadiendo el rate limiter por IP (DEMO-AUTH-02).
 *
 * `Sec-Fetch-Dest`/`Sec-Fetch-Mode` (Fetch Metadata, enviados por navegadores
 * modernos) distinguen navegación real de un sub-resource: una navegación
 * top-level trae `Sec-Fetch-Dest: document` y `Sec-Fetch-Mode: navigate`; un
 * `<img>`/`<iframe>` trae `dest: image|iframe` y/o `mode: no-cors|cors`.
 *
 * Fail-open cuando AMBOS headers están ausentes (clientes legacy que no los
 * envían) — gap residual documentado y aceptado (ver
 * docs/demo-mode-notes.md), no bloqueamos tráfico legítimo de un navegador
 * viejo por un header que ni siquiera puede enviar.
 */
export function esNavegacionDeNivelSuperior(request: Request): boolean {
  const dest = headerValue(request.headers['sec-fetch-dest']);
  const mode = headerValue(request.headers['sec-fetch-mode']);

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
