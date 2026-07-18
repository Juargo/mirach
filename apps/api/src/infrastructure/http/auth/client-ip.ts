import type { Request } from 'express';

/**
 * obtenerIpCliente — IP real del cliente (design.md §1).
 *
 * Usa `request.ip`, que Express calcula honrando `app.set('trust proxy', 1)`
 * (main.ts) — resuelve el primer hop de `x-forwarded-for` SOLO cuando viene
 * de un proxy de confianza (Render/Vercel), en vez de leer el header
 * directamente. Leer `x-forwarded-for` a mano (implementación previa)
 * ignoraba `trust proxy` por completo y confiaba en lo que el cliente
 * dijera ser el hop más a la izquierda — trivialmente falsificable por
 * cualquier request que agregue su propio header.
 *
 * Fallback a `socket.remoteAddress` para los tests/entornos donde `request.ip`
 * no está poblado (mocks sin el stack completo de Express).
 */
export function obtenerIpCliente(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
