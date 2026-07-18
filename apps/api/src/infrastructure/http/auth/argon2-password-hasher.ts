import { hash, verify } from '@node-rs/argon2';
import { IPasswordHasher } from '../../../application/ports/password-hasher.port';

/**
 * Argon2PasswordHasher — implementación de `IPasswordHasher` con `@node-rs/argon2`.
 *
 * Usa la variante argon2id (default de la librería — resistente a side-channel
 * y GPU cracking) con los parámetros de costo por defecto de `@node-rs/argon2`
 * (memoryCost 4096 KB, timeCost 3, parallelism 1). `verify` es en tiempo
 * constante frente al hash provisto (AUTH-03).
 *
 * Solo esta clase importa `@node-rs/argon2` — application nunca toca la
 * librería de hashing directamente (DIP).
 */
export class Argon2PasswordHasher implements IPasswordHasher {
  async hash(plano: string): Promise<string> {
    return hash(plano);
  }

  async verificar(plano: string, hashed: string): Promise<boolean> {
    return verify(hashed, plano);
  }
}
