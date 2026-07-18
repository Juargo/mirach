import { Email } from './email';
import { EmailInvalidoError } from '../errors/email-invalido.error';

describe('Email', () => {
  describe('crear(raw)', () => {
    it('valid email → Result.ok con valor normalizado', () => {
      const result = Email.crear('Jorge@Example.com');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe('jorge@example.com');
    });

    it('trims leading/trailing whitespace before validating', () => {
      const result = Email.crear('  jorge@example.com  ');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe('jorge@example.com');
    });

    it('lowercases mixed-case input (normalization)', () => {
      const result = Email.crear('JORGE@EXAMPLE.COM');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe('jorge@example.com');
    });

    it('missing "@" → Result.fail(EmailInvalidoError)', () => {
      const result = Email.crear('jorge.example.com');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
    });

    it('missing domain (no "." after @) → Result.fail(EmailInvalidoError)', () => {
      const result = Email.crear('jorge@example');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
    });

    it('empty string → Result.fail(EmailInvalidoError)', () => {
      const result = Email.crear('');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
    });

    it('whitespace-only string → Result.fail(EmailInvalidoError)', () => {
      const result = Email.crear('   ');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
    });

    it('email with embedded space → Result.fail(EmailInvalidoError)', () => {
      const result = Email.crear('jorge @example.com');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
    });
  });
});
