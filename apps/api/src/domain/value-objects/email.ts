import { Result } from '../../shared/result';
import { EmailInvalidoError } from '../errors/email-invalido.error';

/**
 * Email — value object de dominio.
 *
 * Normaliza (trim + lowercase) y valida un email con un regex pragmático
 * (KISS — no RFC-5322 exhaustivo). Inmutable, sin setters.
 */
export class Email {
  private static readonly FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(readonly valor: string) {}

  static crear(raw: string): Result<Email, EmailInvalidoError> {
    const normalizado = raw.trim().toLowerCase();

    if (!Email.FORMATO.test(normalizado)) {
      return Result.fail(new EmailInvalidoError(raw));
    }

    return Result.ok(new Email(normalizado));
  }
}
