import { NombreCategoriaDuplicadoError } from './nombre-categoria-duplicado.error';

describe('NombreCategoriaDuplicadoError', () => {
  it('el nombre del error es NombreCategoriaDuplicadoError', () => {
    const error = new NombreCategoriaDuplicadoError('Mascotas');
    expect(error.name).toBe('NombreCategoriaDuplicadoError');
  });

  it('el mensaje describe la colisión sin ecoar el valor crudo', () => {
    const error = new NombreCategoriaDuplicadoError('Mascotas');
    expect(error.message).not.toContain('Mascotas');
    expect(error.message).toContain('nombre');
  });

  it('conserva el nombre original solo para logging server-side', () => {
    const error = new NombreCategoriaDuplicadoError('Mascotas');
    expect(error.rawValue).toBe('Mascotas');
  });
});
