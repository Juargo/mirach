import type { Request } from 'express';

/**
 * obtenerIpCliente — IP real del cliente detrás de los proxies (Vite dev /
 * Vercel prod, design.md §1). Lee el hop más a la izquierda de
 * `x-forwarded-for` (el más cercano al cliente original); si el header está
 * ausente, cae a `req.socket.remoteAddress`. `x-forwarded-for` es
 * spoofable en principio — el límite por-email del rate limiter es el
 * respaldo real contra un IP falsificado (riesgo documentado y aceptado).
 */
export function obtenerIpCliente(request: Request): string {
  const xForwardedFor = request.headers['x-forwarded-for'];
  const valor = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;

  if (valor) {
    return valor.split(',')[0]!.trim();
  }

  return request.socket?.remoteAddress ?? 'unknown';
}
