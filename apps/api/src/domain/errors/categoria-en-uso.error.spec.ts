import { CategoriaEnUsoError } from './categoria-en-uso.error';

describe('CategoriaEnUsoError', () => {
  it('el nombre del error es CategoriaEnUsoError', () => {
    const error = new CategoriaEnUsoError('cat-1');
    expect(error.name).toBe('CategoriaEnUsoError');
  });

  it('el mensaje apunta a reasignar primero y NO promete una migración', () => {
    const error = new CategoriaEnUsoError('cat-1');
    expect(error.message).toMatch(/reasign/i);
    expect(error.message).not.toMatch(/migrar|migración/i);
  });

  it('conserva el id original solo para logging server-side', () => {
    const error = new CategoriaEnUsoError('cat-1');
    expect(error.categoriaId).toBe('cat-1');
  });
});
