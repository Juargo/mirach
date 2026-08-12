/**
 * Module augmentation — tipa `request.userId`, escrito por `SessionGuard`
 * y leído por `@CurrentUser()`. Ver design.md §2.
 *
 * `esDemo` (CAT038-08): escrito por `sessionMiddleware` junto a `userId`,
 * indica si la sesión pertenece a un usuario demo — el catálogo es de
 * solo lectura para esas sesiones. Ver design.md §3.4.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      esDemo?: boolean;
    }
  }
}

export {};
