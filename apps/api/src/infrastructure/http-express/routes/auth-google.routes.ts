import type { Router } from 'express';

/**
 * registrarAuthGoogleDeshabilitado — el stub del router `/api/auth/google*`
 * cuando el feature está apagado (`container.googleAuth === undefined`,
 * design §4.4).
 *
 * Existe porque `router.use(mw)` (el session middleware montado en
 * `protectedApi`, ver `app.ts`) corre para TODA request que llegue al
 * router, matcheada o no — un `/api/auth/google` simplemente no-montado
 * cae en `protectedApi`, encuentra `sessionMiddleware` y responde 401. Ese
 * fallthrough viola AUTH-16, que exige 404 cuando el feature está apagado.
 *
 * La solución no es un guard-clause dentro de cada handler (eso metería el
 * flag booleano en el hot path de la ruta real, Slice C2) sino montar
 * SIEMPRE un router en este path — este stub, o el real
 * (`registrarAuthGoogle`, Slice C2) — decidido UNA sola vez en `app.ts`, en
 * la composición, nunca dentro de un handler.
 */
export function registrarAuthGoogleDeshabilitado(router: Router): void {
  router.get('/auth/google', (_req, res) => {
    res.status(404).end();
  });

  router.get('/auth/google/callback', (_req, res) => {
    res.status(404).end();
  });
}
