import { hash, verify, type Options } from '@node-rs/argon2';
import { IPasswordHasher } from '../../../application/ports/password-hasher.port';

/**
 * ARGON2_OPTIONS — parámetros de costo OWASP para argon2id (AUTH-02/AUTH-03).
 *
 * `@node-rs/argon2`'s defaults (memoryCost=4096, timeCost=3) son más débiles
 * que `HASH_DUMMY_PARA_TIMING` en `login.use-case.ts` (m=19456,t=2) — ese
 * desajuste hacía el timing distinguible entre "email desconocido" (dummy,
 * m=19456) y "contraseña incorrecta" (hash real, m=4096), reabriendo el
 * oráculo de enumeración AUTH-02. Ambos deben usar EXACTAMENTE los mismos
 * parámetros — si cambian aquí, actualizar también `HASH_DUMMY_PARA_TIMING`.
 *
 * `algorithm: 2` es `Algorithm.Argon2id` — se usa el literal numérico en vez
 * de importar el `const enum` porque `isolatedModules` (requerido por el
 * transformador single-file de SWC/esbuild) no permite acceder const enums
 * ambientales de otro paquete. Es también el default de la librería.
 */
export const ARGON2_OPTIONS: Options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2,
};

/**
 * Argon2PasswordHasher — implementación de `IPasswordHasher` con `@node-rs/argon2`.
 *
 * Usa la variante argon2id con `ARGON2_OPTIONS` (parámetros OWASP, no los
 * defaults de la librería). `verify` es en tiempo constante frente al hash
 * provisto (AUTH-03).
 *
 * Solo esta clase importa `@node-rs/argon2` — application nunca toca la
 * librería de hashing directamente (DIP).
 */
export class Argon2PasswordHasher implements IPasswordHasher {
  async hash(plano: string): Promise<string> {
    return hash(plano, ARGON2_OPTIONS);
  }

  async verificar(plano: string, hashed: string): Promise<boolean> {
    return verify(hashed, plano);
  }
}
