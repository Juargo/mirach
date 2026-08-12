import { NombreCategoriaInvalidoError } from './nombre-categoria-invalido.error';

describe('NombreCategoriaInvalidoError', () => {
  it('el nombre del error es NombreCategoriaInvalidoError', () => {
    const error = new NombreCategoriaInvalidoError('');
    expect(error.name).toBe('NombreCategoriaInvalidoError');
  });

  it('el mensaje describe el formato esperado (1–40 caracteres)', () => {
    const error = new NombreCategoriaInvalidoError('');
    expect(error.message).toMatch(/1.*40/);
  });

  it('conserva el valor original solo para logging server-side', () => {
    const error = new NombreCategoriaInvalidoError('x'.repeat(41));
    expect(error.rawValue).toBe('x'.repeat(41));
  });
});
