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
      icono: null,
      esInterna: false,
    });

    expect(dto).toEqual({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
      icono: null,
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
      icono: null,
      esInterna: false,
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
      icono: null,
      esInterna: false,
    });

    expect(dto.transaccionesCount).toBe(7);
  });

  it('threads a set icono through unchanged (categoria-iconografia CATICO-02)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 0,
      icono: 'paw-print',
      esInterna: false,
    });

    expect(dto.icono).toBe('paw-print');
  });

  it('the mapper ALWAYS sets the icono key, even when null (D-11 runtime guarantee)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 0,
      icono: null,
      esInterna: false,
    });

    expect(dto).toHaveProperty('icono');
    expect(dto.icono).toBeNull();
  });
});
