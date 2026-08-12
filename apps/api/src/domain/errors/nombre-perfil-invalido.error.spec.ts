import { NombrePerfilInvalidoError } from './nombre-perfil-invalido.error';

describe('NombrePerfilInvalidoError', () => {
  it('el nombre del error es NombrePerfilInvalidoError', () => {
    const error = new NombrePerfilInvalidoError('');
    expect(error.name).toBe('NombrePerfilInvalidoError');
  });

  it('el mensaje describe el formato esperado (1–80 caracteres)', () => {
    const error = new NombrePerfilInvalidoError('');
    expect(error.message).toMatch(/1.*80/);
  });

  it('conserva el valor original solo para logging server-side', () => {
    const error = new NombrePerfilInvalidoError('x'.repeat(81));
    expect(error.rawValue).toBe('x'.repeat(81));
  });
});
