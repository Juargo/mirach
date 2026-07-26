import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * createApiKeyMiddleware — factory, port 1:1 del `ApiKeyGuard` (ADR-028/029).
 *
 * Exige `x-api-key` y lo compara en tiempo constante contra la key inyectada.
 * Diseño fail-closed:
 *   - `apiKey` ausente o < 16 chars → lanza EN BOOT (al construir el
 *     middleware), no por request. `env.ts` ya valida esto vía `loadEnv()`
 *     (min 16 chars) — este guard es defensivo para uso directo sin pasar por
 *     `loadEnv`. Antes de ADR-029 esto era un 500 por request; ahora "servicio
 *     mal configurado" ni siquiera llega a levantar la app.
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

export function createApiKeyMiddleware(apiKey: string): RequestHandler {
  if (apiKey.length < 16) {
    throw new Error(
      'createApiKeyMiddleware requiere una API key de al menos 16 caracteres.',
    );
  }

  return (req, res, next) => {
    const received = req.header(HEADER);
    if (!received || !safeEqual(received, apiKey)) {
      res.status(401).json({ message: 'API key inválida o ausente.' });
      return;
    }

    next();
  };
}
