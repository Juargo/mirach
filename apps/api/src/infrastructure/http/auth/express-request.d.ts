/**
 * Module augmentation — tipa `request.userId`, escrito por `SessionGuard`
 * y leído por `@CurrentUser()`. Ver design.md §2.
 *
 * `esDemo` (CAT038-08): escrito por `sessionMiddleware` junto a `userId`,
 * indica si la sesión pertenece a un usuario demo — el catálogo es de
 * solo lectura para esas sesiones. Ver design.md §3.4.
 *
 * `sessionTokenHash` (US-040, PERF040-06, design.md §4.3): escrito por
 * `sessionMiddleware` en éxito, junto a `userId`/`esDemo`. Es un hash
 * SHA-256 — la forma que ya vive en `Session.tokenHash` — NUNCA el token
 * crudo. Único consumidor: `CambiarPasswordUseCase` lo usa como
 * `tokenHashActual` para saber qué sesión NO revocar. NUNCA loguearlo ni
 * serializarlo a una respuesta.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      esDemo?: boolean;
      sessionTokenHash?: string;
    }
  }
}

export {};
