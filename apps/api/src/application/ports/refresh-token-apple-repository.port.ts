/**
 * IRefreshTokenAppleRepository — guarda y lee el refresh token de Sign in with
 * Apple de un usuario. El token es un secreto: la implementación lo persiste
 * CIFRADO (ADR-013) y el puerto solo expone el valor en claro a quien lo
 * necesita (el revocador); ningún use case lo loguea.
 */
export interface IRefreshTokenAppleRepository {
  /** Sobrescribe el token del usuario. No-op si el usuario no existe. */
  guardar(userId: string, refreshToken: string): Promise<void>;
  /** El token en claro, o `null` si el usuario no tiene (o no existe). */
  obtener(userId: string): Promise<string | null>;
}
