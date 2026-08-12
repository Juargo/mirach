import { agruparPorCategoriaBucket } from './agrupar-por-categoria-bucket';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * agruparPorCategoriaBucket — helper puro compartido (US-013 S3, DRY).
 *
 * Extraído de PrismaTransaccionBucketRepository y backfill-categorias.ts:
 * ambos agrupaban asignaciones por la clave compuesta (categoriaId, bucket)
 * con lógica casi idéntica. Este spec fija el contrato de agrupación antes
 * de refactorizar ambos callers para usarlo.
 *
 * Q5 (us-038 design.md): la clave pasa de `categoria` (enum) a `categoriaId`
 * (string | null) — la agrupación viaja el id real de la fila del usuario,
 * no un miembro de un tipo cerrado (ADR-037).
 */
describe('agruparPorCategoriaBucket()', () => {
  it('returns an empty array for an empty input', () => {
    expect(agruparPorCategoriaBucket([])).toEqual([]);
  });

  it('groups ids with the same (categoriaId, bucket) into a single group', () => {
    const grupos = agruparPorCategoriaBucket([
      {
        id: 'tx-1',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
      {
        id: 'tx-2',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toEqual({
      categoriaId: 'cat-supermercado',
      bucket: Bucket.Necesidades,
      ids: ['tx-1', 'tx-2'],
    });
  });

  it('keeps two DIFFERENT categorías deriving to the SAME bucket as separate groups', () => {
    // Supermercado and Combustible both derive to Necesidades — but they are
    // different categorías (distinct categoriaId) and must stay in separate
    // groups, even though bucket is identical for both.
    const grupos = agruparPorCategoriaBucket([
      {
        id: 'tx-1',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
      {
        id: 'tx-2',
        categoriaId: 'cat-combustible',
        bucket: Bucket.Necesidades,
      },
    ]);

    expect(grupos).toHaveLength(2);
    const supermercado = grupos.find(
      (g) => g.categoriaId === 'cat-supermercado',
    );
    const combustible = grupos.find((g) => g.categoriaId === 'cat-combustible');
    expect(supermercado?.ids).toEqual(['tx-1']);
    expect(combustible?.ids).toEqual(['tx-2']);
  });

  it('groups null categoriaId (Ingreso/SinCategoria) rows by bucket', () => {
    const grupos = agruparPorCategoriaBucket([
      { id: 'tx-1', categoriaId: null, bucket: Bucket.Ingreso },
      { id: 'tx-2', categoriaId: null, bucket: Bucket.Ingreso },
      { id: 'tx-3', categoriaId: null, bucket: Bucket.SinCategoria },
    ]);

    expect(grupos).toHaveLength(2);
    const ingreso = grupos.find((g) => g.bucket === Bucket.Ingreso);
    const sinCategoria = grupos.find((g) => g.bucket === Bucket.SinCategoria);
    expect(ingreso).toEqual({
      categoriaId: null,
      bucket: Bucket.Ingreso,
      ids: ['tx-1', 'tx-2'],
    });
    expect(sinCategoria).toEqual({
      categoriaId: null,
      bucket: Bucket.SinCategoria,
      ids: ['tx-3'],
    });
  });

  it('preserves id order within a group and does not mutate the input array', () => {
    const asignaciones = [
      { id: 'tx-b', categoriaId: 'cat-streaming', bucket: Bucket.Deseos },
      { id: 'tx-a', categoriaId: 'cat-streaming', bucket: Bucket.Deseos },
    ];
    const asignacionesCopy = [...asignaciones];

    const grupos = agruparPorCategoriaBucket(asignaciones);

    expect(grupos[0].ids).toEqual(['tx-b', 'tx-a']);
    expect(asignaciones).toEqual(asignacionesCopy);
  });
});
