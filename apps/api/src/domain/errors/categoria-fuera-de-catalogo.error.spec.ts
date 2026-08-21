import { CategoriaFueraDeCatalogoError } from './categoria-fuera-de-catalogo.error';

describe('CategoriaFueraDeCatalogoError', () => {
  it('construye con un mensaje descriptivo fijo', () => {
    const error = new CategoriaFueraDeCatalogoError('cat_ajeno');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CategoriaFueraDeCatalogoError);
    expect(error.name).toBe('CategoriaFueraDeCatalogoError');
  });

  it('el mensaje es una constante fija: no interpola el categoriaId ni datos del request', () => {
    const error = new CategoriaFueraDeCatalogoError('cat_ajeno');

    expect(error.message).toContain('categoría');
    // El categoriaId (texto provisto por el caller) NUNCA aparece en el mensaje (ADR-013).
    expect(error.message).not.toContain('cat_ajeno');
    // No debe contener montos ni datos financieros crudos
    expect(error.message).not.toContain('1500000');
    expect(error.message).not.toContain('amount');
  });

  it('el mensaje es idéntico para cualquier categoriaId (constante de compilación)', () => {
    const a = new CategoriaFueraDeCatalogoError('cat_ajeno_a');
    const b = new CategoriaFueraDeCatalogoError(
      'clm_cat_user_b_totalmente_distinto',
    );

    // El mensaje no depende del input — es fijo, como RowIndexFueraDeRangoError.
    expect(a.message).toBe(b.message);
  });

  it('expone el categoriaId como propiedad', () => {
    const error = new CategoriaFueraDeCatalogoError('cat_ajeno');

    expect(error.categoriaId).toBe('cat_ajeno');
  });

  it('es instancia de Error (hereda correctamente)', () => {
    const error = new CategoriaFueraDeCatalogoError('some-id');

    expect(error instanceof Error).toBe(true);
  });

  it('rechaza un categoriaId que no pertenece al catálogo del usuario (cross-tenant)', () => {
    // Este test documenta el escenario de seguridad RNF-SEC-006
    const categoriaIdAjeno = 'clm_cat_user_b';
    const error = new CategoriaFueraDeCatalogoError(categoriaIdAjeno);

    expect(error.categoriaId).toBe(categoriaIdAjeno);
    expect(error.name).toBe('CategoriaFueraDeCatalogoError');
  });
});
