/** SesionPersistida — proyección mínima de una sesión almacenada, para validación. */
export interface SesionPersistida {
  readonly userId: string;
  readonly expiresAt: Date;
}

/**
 * ISessionRepository — puerto de persistencia de sesiones (AUTH-04, AUTH-06, AUTH-07).
 *
 * `revocarPorTokenHash` es idempotente — revocar dos veces el mismo hash (o un
 * hash inexistente) no falla; simplemente no hay fila que revocar.
 */
export interface ISessionRepository {
  crear(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SesionPersistida | null>;
  revocarPorTokenHash(tokenHash: string): Promise<void>;
}

/** Injection token — interfaces are erased at runtime. */
export const SESSION_REPOSITORY = 'ISessionRepository';
