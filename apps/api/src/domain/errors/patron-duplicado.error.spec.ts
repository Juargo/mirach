import { PatronDuplicadoError } from './patron-duplicado.error';

describe('PatronDuplicadoError', () => {
  it('el nombre del error es PatronDuplicadoError', () => {
    const error = new PatronDuplicadoError('netflix');
    expect(error.name).toBe('PatronDuplicadoError');
  });

  it('el mensaje describe la colisión sin ecoar el valor crudo', () => {
    const error = new PatronDuplicadoError('netflix');
    expect(error.message).not.toContain('netflix');
    expect(error.message).toContain('patrón');
  });

  it('conserva el patrón original solo para logging server-side', () => {
    const error = new PatronDuplicadoError('netflix');
    expect(error.rawValue).toBe('netflix');
  });
});

describe('PatronDuplicadoError — existente (CLA-17)', () => {
  it('carries the pattern that already holds the text', () => {
    const existente = {
      patronId: 'p-2',
      categoriaId: 'cat-cafes',
      categoria: 'Cafés',
      bucket: 'Deseos' as never,
    };
    expect(new PatronDuplicadoError('cafe', existente).existente).toBe(
      existente,
    );
  });

  it('existente is null when the caller does not know it', () => {
    expect(new PatronDuplicadoError('cafe').existente).toBeNull();
  });
});
