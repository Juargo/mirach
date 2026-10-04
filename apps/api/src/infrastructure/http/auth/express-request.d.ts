/**
 * Module augmentation — tipa `request.userId`, escrito por `SessionGuard`
 * y leído por `@CurrentUser()`. Ver design.md §2.
 *
 * `sessionTokenHash` (US-040, PERF040-06, design.md §4.3): escrito por
 * `sessionMiddleware` en éxito, junto a `userId`. Es un hash
 * SHA-256 — la forma que ya vive en `Session.tokenHash` — NUNCA el token
 * crudo. Único consumidor: `CambiarPasswordUseCase` lo usa como
 * `tokenHashActual` para saber qué sesión NO revocar. NUNCA loguearlo ni
 * serializarlo a una respuesta.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionTokenHash?: string;
    }
  }
}

export {};
