import { Result } from '../../shared/result';
import { PasswordInvalidaError } from '../errors/password-invalida.error';

/**
 * Password — value object de dominio (US-040, design.md D-02).
 *
 * Regla: 8–128 caracteres, length over composition classes (NIST 800-63B) —
 * sin clases forzadas de símbolo/dígito, sin diccionario. El límite superior
 * es una guarda de costo CPU de argon2id, no cosmética. El número vive en UN
 * solo lugar (acá) — `passwordUpdateRequestSchema` NO lo restata
 * (layer-honesty gate, `categorias.schema.ts` precedent).
 *
 * `valor` NO se recorta (a diferencia de `Email`) — los espacios son
 * caracteres legítimos de una contraseña.
 *
 * Hashing NO vive acá: el VO es dominio puro, síncrono, sin dependencias.
 * argon2id es infraestructura async/CPU-bound con su propio puerto
 * (`IPasswordHasher`) — el use case llama `hasher.hash(password.valor)`.
 *
 * `toJSON()` es defensa en profundidad (proposal's CRITICAL risk: password
 * material reaching a log): `SENSITIVE_REDACT_PATHS` cubre KEYS como
 * `password`/`*.password`, pero un `logger.debug('…', { nuevaPassword: vo })`
 * serializaría `{"valor":"secreto"}` bajo un path no redactado.
 * `toJSON()` cierra ese vector en el objeto mismo.
 */
export class Password {
  private static readonly MIN = 8;
  private static readonly MAX = 128;

  private constructor(readonly valor: string) {}

  static crear(raw: string): Result<Password, PasswordInvalidaError> {
    if (raw.length < Password.MIN || raw.length > Password.MAX) {
      return Result.fail(new PasswordInvalidaError());
    }

    return Result.ok(new Password(raw));
  }

  toJSON(): string {
    return '[REDACTED]';
  }
}
