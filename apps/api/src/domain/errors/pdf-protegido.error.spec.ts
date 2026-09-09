import { PdfProtegidoError } from './pdf-protegido.error';

describe('PdfProtegidoError', () => {
  it('tiene name "PdfProtegidoError" y motivo "requiere-password" sin interpolar ningún password', () => {
    const error = new PdfProtegidoError('archivo.pdf', 'requiere-password');

    expect(error.name).toBe('PdfProtegidoError');
    expect(error.motivo).toBe('requiere-password');
    expect(error.message).toContain('archivo.pdf');
    expect(error.message).not.toContain('password');
  });

  it('tiene motivo "password-incorrecta" con un mensaje distinto del de "requiere-password"', () => {
    const requierePassword = new PdfProtegidoError(
      'archivo.pdf',
      'requiere-password',
    );
    const passwordIncorrecta = new PdfProtegidoError(
      'archivo.pdf',
      'password-incorrecta',
    );

    expect(passwordIncorrecta.motivo).toBe('password-incorrecta');
    expect(passwordIncorrecta.message).not.toBe(requierePassword.message);
  });

  it('es instancia de Error', () => {
    const error = new PdfProtegidoError('archivo.pdf', 'requiere-password');

    expect(error).toBeInstanceOf(Error);
  });
});
