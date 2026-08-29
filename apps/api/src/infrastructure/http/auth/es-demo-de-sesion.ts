import type { Request } from 'express';

/**
 * esDemoDeSesion — lectura fail-closed de `req.esDemo` (issue #507).
 *
 * `express-request.d.ts` tipa `esDemo?: boolean` porque la augmentation
 * aplica a TODA request, incluidas las rutas públicas donde `esDemo`
 * legítimamente todavía no existe — tiparlo no-opcional sería una mentira de
 * tipos. `sessionMiddleware` SIEMPRE lo escribe para una request autenticada
 * (ver su docstring + `ValidarSesionResult.esDemo: boolean` no-opcional), así
 * que en la práctica esta función nunca debería ver `undefined` en una ruta
 * gateada — pero un `req.esDemo!` (non-null assertion) no lanza si algún
 * refactor futuro monta una ruta sin `sessionMiddleware`, o si una sesión
 * llega malformada: `if (input.esDemo)` evaluaría falsy y el gate de
 * solo-lectura FALLARÍA ABIERTO.
 *
 * Regla: "no puedo probar que la sesión NO es demo" ⇒ tratarla como demo.
 * Usar SIEMPRE en lugar de `req.esDemo!` en toda ruta gateada
 * (perfil/perfil-google/categorías/patrones/ingesta) — es un cinturón para
 * refactors, no una rama alcanzable hoy (ver session.middleware.ts para la
 * cadena de derivación real).
 */
export function esDemoDeSesion(req: Request): boolean {
  return req.esDemo ?? true;
}
