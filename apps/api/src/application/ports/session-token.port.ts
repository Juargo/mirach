/** TokenGenerado — el token opaco crudo y su hash SHA-256, generados juntos. */
export interface TokenGenerado {
  readonly token: string;
  readonly tokenHash: string;
}

/**
 * ISessionTokenService — puerto para generar tokens opacos de sesión y
 * calcular su hash de búsqueda (AUTH-04). Solo el hash se persiste; el
 * token crudo nunca toca la base de datos.
 */
export interface ISessionTokenService {
  generar(): TokenGenerado;
  hashToken(token: string): string;
}

/** Injection token — interfaces are erased at runtime. */
export const SESSION_TOKEN_SERVICE = 'ISessionTokenService';
