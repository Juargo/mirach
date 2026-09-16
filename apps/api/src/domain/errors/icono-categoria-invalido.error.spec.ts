import { describe, it, expect } from 'vitest';
import { IconoCategoriaInvalidoError } from './icono-categoria-invalido.error';

describe('IconoCategoriaInvalidoError', () => {
  it('el nombre del error es IconoCategoriaInvalidoError', () => {
    const error = new IconoCategoriaInvalidoError('not-a-real-icon');
    expect(error.name).toBe('IconoCategoriaInvalidoError');
  });

  it('el mensaje nunca repite el rawValue recibido (layer-honesty gate, CATICO-02/03)', () => {
    const rawValue = 'not-a-real-icon-<script>alert(1)</script>';
    const error = new IconoCategoriaInvalidoError(rawValue);
    expect(error.message).not.toContain(rawValue);
  });

  it('un rawValue distinto tampoco aparece en el mensaje (triangulación)', () => {
    const rawValue = 'otro-valor-arbitrario';
    const error = new IconoCategoriaInvalidoError(rawValue);
    expect(error.message).not.toContain(rawValue);
  });

  it('rawValue queda disponible solo como campo separado, para logging server-side', () => {
    expect(new IconoCategoriaInvalidoError('bogus').rawValue).toBe('bogus');
    expect(new IconoCategoriaInvalidoError(null).rawValue).toBeNull();
    expect(new IconoCategoriaInvalidoError(undefined).rawValue).toBeUndefined();
  });
});
