/**
 * IPasswordHasher — puerto para hashear y verificar contraseñas (AUTH-03).
 *
 * La implementación concreta (infra) usa argon2id con verificación en tiempo
 * constante. Application nunca importa la librería de hashing directamente.
 */
export interface IPasswordHasher {
  hash(plano: string): Promise<string>;
  verificar(plano: string, hash: string): Promise<boolean>;
}

/** Injection token — interfaces are erased at runtime. */
export const PASSWORD_HASHER = 'IPasswordHasher';
