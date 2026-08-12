import { foldCategoria } from './fold-categoria';
import { Categoria } from '../../domain/value-objects/categoria';

/**
 * Unit tests for foldCategoria (D-09, CAT037-06).
 *
 * This is the test that would have caught the fold-to-null defect: it folds
 * a nested `{ id, nombre }` row by `nombre` (a Categoria enum value), never
 * by looking a physical id up in a legacy global id map — so it works for
 * ANY user's per-user catalog row, not only the bootstrap user's fixed ids.
 */
describe('foldCategoria', () => {
  it('null folds to null', () => {
    expect(foldCategoria(null)).toBeNull();
  });

  it('undefined folds to null', () => {
    expect(foldCategoria(undefined)).toBeNull();
  });

  it('an unknown nombre folds to null (defensive)', () => {
    const row = { id: 'cly-some-random-cuid', nombre: 'NoExiste' };
    expect(foldCategoria(row)).toBeNull();
  });

  it('a known nombre with an arbitrary cuid id folds to { id, nombre } using the REAL row id', () => {
    const row = {
      id: 'cly-arbitrary-per-user-cuid',
      nombre: Categoria.Streaming,
    };
    expect(foldCategoria(row)).toEqual({
      id: 'cly-arbitrary-per-user-cuid',
      nombre: Categoria.Streaming,
    });
  });
});
