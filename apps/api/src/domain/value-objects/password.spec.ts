import { Password } from './password';
import { PasswordInvalidaError } from '../errors/password-invalida.error';

describe('Password', () => {
  describe('crear(raw)', () => {
    it('7 caracteres → Result.fail(PasswordInvalidaError)', () => {
      const result = Password.crear('1234567');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PasswordInvalidaError);
    });

    it('8 caracteres → Result.ok', () => {
      const result = Password.crear('12345678');

      expect(result.isOk()).toBe(true);
    });

    it('128 caracteres → Result.ok', () => {
      const result = Password.crear('a'.repeat(128));

      expect(result.isOk()).toBe(true);
    });

    it('129 caracteres → Result.fail(PasswordInvalidaError)', () => {
      const result = Password.crear('a'.repeat(129));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PasswordInvalidaError);
    });

    it('valor NO se recorta — los espacios son caracteres legítimos', () => {
      const conEspacios = '  clave-valida  ';
      const result = Password.crear(conEspacios);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe(conEspacios);
    });
  });

  describe('toJSON()', () => {
    it('JSON.stringify nunca expone el texto plano', () => {
      const password = Password.crear('secreto-super-valido').getValue();

      const serializado = JSON.stringify(password);

      expect(serializado).toContain('[REDACTED]');
      expect(serializado).not.toContain('secreto-super-valido');
    });

    it('JSON.stringify de un objeto que envuelve la password tampoco filtra el valor', () => {
      const password = Password.crear('otra-clave-valida').getValue();

      const serializado = JSON.stringify({ nuevaPassword: password });

      expect(serializado).not.toContain('otra-clave-valida');
    });
  });
});
