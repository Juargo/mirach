import { PasswordInvalidaError } from './password-invalida.error';

describe('PasswordInvalidaError', () => {
  it('el nombre del error es PasswordInvalidaError', () => {
    const error = new PasswordInvalidaError();
    expect(error.name).toBe('PasswordInvalidaError');
  });

  it('el mensaje describe la regla (8-128 caracteres)', () => {
    const error = new PasswordInvalidaError();
    expect(error.message).toMatch(/8.*128/);
  });

  it('NO tiene una propiedad rawValue — a diferencia de EmailInvalidoError, una password es un secreto', () => {
    const error = new PasswordInvalidaError();
    expect(
      (error as unknown as { rawValue?: unknown }).rawValue,
    ).toBeUndefined();
  });

  it('JSON.stringify no contiene ninguna substring de la password intentada', () => {
    const passwordIntentada = 'mi-clave-secreta-de-prueba';
    const error = new PasswordInvalidaError();

    const serializado = JSON.stringify(error);

    expect(serializado).not.toContain(passwordIntentada);
  });
});
