import { aCatalogoDto } from './catalogo.dto';
import { Bucket } from '../../../domain/value-objects/bucket';

describe('aCatalogoDto', () => {
  it('wraps the mapped categorias list for GET /api/categorias', () => {
    const dto = aCatalogoDto([
      { id: 'cat-1', nombre: 'Mascotas', bucket: Bucket.Deseos, patrones: [] },
    ]);

    expect(dto).toEqual({
      categorias: [
        { id: 'cat-1', nombre: 'Mascotas', bucket: 'Deseos', patrones: [] },
      ],
    });
  });

  it('an empty catalog maps to { categorias: [] }', () => {
    expect(aCatalogoDto([])).toEqual({ categorias: [] });
  });
});
