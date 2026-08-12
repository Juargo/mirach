import { aCategoriaDto } from './categoria.dto';
import { Bucket } from '../../../domain/value-objects/bucket';

describe('aCategoriaDto', () => {
  it('maps a CategoriaConPatrones with zero patterns to patrones: [] (CA-03)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 0,
    });

    expect(dto).toEqual({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
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
      transaccionesCount: 0,
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

  it('passes a non-zero transaccionesCount through unchanged (CAT039-01)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 7,
    });

    expect(dto.transaccionesCount).toBe(7);
  });
});
