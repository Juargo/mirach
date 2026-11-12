/**
 * IRenovadorSesion — extiende el vencimiento de una sesión existente
 * (ADR-013, sesión de una cuenta anónima). Separado de `ISessionRepository`
 * porque solo `ValidarSesionUseCase` lo necesita.
 */
export interface IRenovadorSesion {
  renovar(tokenHash: string, expiresAt: Date): Promise<void>;
}
