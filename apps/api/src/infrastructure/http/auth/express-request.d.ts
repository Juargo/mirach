/**
 * Module augmentation — tipa `request.userId`, escrito por `SessionGuard`
 * y leído por `@CurrentUser()`. Ver design.md §2.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
