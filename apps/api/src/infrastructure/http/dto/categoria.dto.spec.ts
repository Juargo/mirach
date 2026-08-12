import { aCategoriaDto } from './categoria.dto';
import { Bucket } from '../../../domain/value-objects/bucket';

describe('aCategoriaDto', () => {
  it('maps a CategoriaConPatrones with zero patterns to patrones: [] (CA-03)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
    });

    expect(dto).toEqual({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });
  });

  it('maps nested patrones through aPatronDto', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [
        {
          id: 'pat-1',
          categoriaId: 'cat-1',
          patron: 'petco',
          matchType: 'CONTAINS',
          prioridad: 100,
        },
      ],
    });

    expect(dto.patrones).toEqual([
      {
        id: 'pat-1',
        categoriaId: 'cat-1',
        patron: 'petco',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
    ]);
  });
});
