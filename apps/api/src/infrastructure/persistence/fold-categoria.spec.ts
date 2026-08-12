import { foldCategoria } from './fold-categoria';

/**
 * Unit tests for foldCategoria (D-01, CAT037-06).
 *
 * ADR-037 retires the closed `Categoria` enum: category identity is now a
 * userId-scoped row, not a compile-time type. The old defensive guard
 * (`CATEGORIA_NOMBRES.has(nombre)` ⇒ null on an "unknown" name) never was
 * the isolation mechanism — the row already arrives from a query whose
 * `WHERE` carries `userId` — and keeping it would make every user-created
 * category vanish from the dashboard without an error. This inverted test
 * IS the point: an arbitrary owned name must pass through verbatim.
 */
describe('foldCategoria', () => {
  it('null folds to null', () => {
    expect(foldCategoria(null)).toBeNull();
  });

  it('undefined folds to null', () => {
    expect(foldCategoria(undefined)).toBeNull();
  });

  it('an arbitrary owned category name passes through verbatim (no enum gate)', () => {
    const row = { id: 'cly-some-random-cuid', nombre: 'Mascotas' };
    expect(foldCategoria(row)).toEqual({
      id: 'cly-some-random-cuid',
      nombre: 'Mascotas',
    });
  });

  it('a template-catalog nombre with an arbitrary cuid id folds to { id, nombre } using the REAL row id', () => {
    const row = {
      id: 'cly-arbitrary-per-user-cuid',
      nombre: 'Streaming',
    };
    expect(foldCategoria(row)).toEqual({
      id: 'cly-arbitrary-per-user-cuid',
      nombre: 'Streaming',
    });
  });
});
