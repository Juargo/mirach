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

  it('el mensaje es bucket-aware (ADR-042, D-12) — la unicidad ahora es por bucket', () => {
    const error = new NombreCategoriaDuplicadoError('Mascotas');
    expect(error.message).toBe(
      'Ya existe una categoría con ese nombre en ese bucket.',
    );
  });

  it('conserva el nombre original solo para logging server-side', () => {
    const error = new NombreCategoriaDuplicadoError('Mascotas');
    expect(error.rawValue).toBe('Mascotas');
  });
});
