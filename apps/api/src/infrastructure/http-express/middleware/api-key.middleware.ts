import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * apiKeyMiddleware — port 1:1 del `ApiKeyGuard` (ADR-028).
 *
 * Exige `x-api-key` y lo compara en tiempo constante contra `process.env.API_KEY`.
 * Diseño fail-closed:
 *   - `API_KEY` ausente o < 16 chars → 500, se rechaza TODO (no exponer datos).
 *   - Header ausente o key incorrecta → 401.
 * Nunca refleja el valor recibido (evita filtrado por eco). Las rutas públicas
 * (health) simplemente NO montan este middleware — no hay `@Public()` en Express.
 */
const HEADER = 'x-api-key';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const apiKeyMiddleware: RequestHandler = (req, res, next) => {
  const expected = process.env.API_KEY;
  if (!expected || expected.length < 16) {
    // Fail-closed: sin una API key robusta configurada, no se atiende nada.
    console.error(
      'API_KEY no configurada (o demasiado corta). Se rechazan todas las peticiones protegidas.',
    );
    res.status(500).json({ message: 'Servicio mal configurado.' });
    return;
  }

  const received = req.header(HEADER);
  if (!received || !safeEqual(received, expected)) {
    res.status(401).json({ message: 'API key inválida o ausente.' });
    return;
  }

  next();
};
