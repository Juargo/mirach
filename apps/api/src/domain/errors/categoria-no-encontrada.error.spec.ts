import { CategoriaDesconocidaError } from './categoria-desconocida.error';
import { CategoriaNoEncontradaError } from './categoria-no-encontrada.error';

describe('CategoriaNoEncontradaError', () => {
  it('el nombre del error es CategoriaNoEncontradaError', () => {
    const error = new CategoriaNoEncontradaError('cat-1');
    expect(error.name).toBe('CategoriaNoEncontradaError');
  });

  it('el mensaje está scrubbeado: no enumera ningún nombre de categoría', () => {
    const error = new CategoriaNoEncontradaError('cat-1');
    expect(error.message).not.toMatch(
      /Necesidades|Deseos|Ahorro|Ingreso|SinCategoria/,
    );
  });

  it('conserva el id original solo para logging server-side', () => {
    const error = new CategoriaNoEncontradaError('cat-1');
    expect(error.categoriaId).toBe('cat-1');
  });
});

describe('CategoriaDesconocidaError', () => {
  it('el nombre del error es CategoriaDesconocidaError', () => {
    const error = new CategoriaDesconocidaError('cat-mascotas-id');
    expect(error.name).toBe('CategoriaDesconocidaError');
  });

  it('el mensaje está scrubbeado: no enumera ningún nombre de categoría', () => {
    const error = new CategoriaDesconocidaError('cat-mascotas-id');
    expect(error.message).not.toMatch(
      /Necesidades|Deseos|Ahorro|Ingreso|SinCategoria/,
    );
  });

  it('conserva el categoriaId original solo para logging server-side (ADR-042: ya no es un nombre)', () => {
    const error = new CategoriaDesconocidaError('cat-mascotas-id');
    expect(error.categoriaId).toBe('cat-mascotas-id');
  });
});

describe('CategoriaNoEncontradaError y CategoriaDesconocidaError son clases distintas', () => {
  it('una instancia de una no es instancia de la otra (invariante "un error, un status")', () => {
    const noEncontrada = new CategoriaNoEncontradaError('cat-1');
    const desconocida = new CategoriaDesconocidaError('Mascotas');
    expect(noEncontrada).not.toBeInstanceOf(CategoriaDesconocidaError);
    expect(desconocida).not.toBeInstanceOf(CategoriaNoEncontradaError);
  });
});
