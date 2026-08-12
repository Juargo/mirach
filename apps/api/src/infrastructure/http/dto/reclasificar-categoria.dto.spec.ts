import { aReclasificarCategoriaDto } from './reclasificar-categoria.dto';
import { ReclasificarCategoriaResult } from '../../../application/ports/reclasificar-categoria.port';
import { Bucket } from '../../../domain/value-objects/bucket';
import { Categoria } from '../../../domain/value-objects/categoria';

const makeResult = (
  overrides: Partial<ReclasificarCategoriaResult> = {},
): ReclasificarCategoriaResult => ({
  id: 'tx-1',
  categoriaId: 'cat-real-row-id',
  categoria: Categoria.Transporte,
  bucket: Bucket.Necesidades,
  ...overrides,
});

describe('aReclasificarCategoriaDto', () => {
  // US-037 (CAT037-04): el id físico expuesto en `categoria.id` DEBE ser el
  // que ya viene resuelto en `data.categoriaId` — este mapper nunca lo
  // resuelve por su cuenta (no hay ningún import de CATEGORIA_IDS).
  it('emite data.categoriaId como categoria.id — nunca un id resuelto localmente', () => {
    const dto = aReclasificarCategoriaDto(
      makeResult({ categoriaId: 'cat-real-row-id-de-user-a' }),
    );

    expect(dto.categoria.id).toBe('cat-real-row-id-de-user-a');
  });

  it('dos resultados con la misma categoria pero distinto categoriaId producen ids DISTINTOS en el DTO', () => {
    const dtoA = aReclasificarCategoriaDto(
      makeResult({ categoriaId: 'cat-a-transporte' }),
    );
    const dtoB = aReclasificarCategoriaDto(
      makeResult({ categoriaId: 'cat-b-transporte' }),
    );

    expect(dtoA.categoria.id).toBe('cat-a-transporte');
    expect(dtoB.categoria.id).toBe('cat-b-transporte');
    expect(dtoA.categoria.id).not.toBe(dtoB.categoria.id);
  });

  it('mapea id, categoria.nombre y bucket sin transformarlos', () => {
    const dto = aReclasificarCategoriaDto(
      makeResult({
        id: 'tx-42',
        categoria: Categoria.Ahorro,
        bucket: Bucket.Ahorro,
      }),
    );

    expect(dto).toEqual({
      id: 'tx-42',
      categoria: { id: 'cat-real-row-id', nombre: Categoria.Ahorro },
      bucket: Bucket.Ahorro,
    });
  });
});
