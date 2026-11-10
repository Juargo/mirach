import { Bucket } from './bucket';
import {
  agruparClasificacionPreview,
  FilaClasificadaPreview,
} from './resumen-clasificacion-preview';

const DESCONOCIDO_ID = 'cat-desconocido-deseos';

function fila(
  overrides: Partial<FilaClasificadaPreview> = {},
): FilaClasificadaPreview {
  return {
    rowIndex: 0,
    cargo: 1000n,
    abono: 0n,
    esDuplicado: false,
    bucket: Bucket.Necesidades,
    categoria: { id: 'cat-super', nombre: 'Supermercado' },
    ...overrides,
  };
}

describe('agruparClasificacionPreview — buckets y categorías', () => {
  it('agrupa las filas por bucket y, dentro, por categoría, con conteo y total de cargo', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({ rowIndex: 0, cargo: 1000n }),
        fila({ rowIndex: 1, cargo: 2500n }),
        fila({
          rowIndex: 2,
          cargo: 300n,
          bucket: Bucket.Deseos,
          categoria: { id: 'cat-cafe', nombre: 'Cafetería' },
        }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets).toEqual([
      {
        bucket: Bucket.Necesidades,
        cantidad: 2,
        total: 3500n,
        categorias: [
          {
            categoriaId: 'cat-super',
            nombre: 'Supermercado',
            cantidad: 2,
            total: 3500n,
            filas: [0, 1],
          },
        ],
      },
      {
        bucket: Bucket.Deseos,
        cantidad: 1,
        total: 300n,
        categorias: [
          {
            categoriaId: 'cat-cafe',
            nombre: 'Cafetería',
            cantidad: 1,
            total: 300n,
            filas: [2],
          },
        ],
      },
    ]);
  });

  it('ordena los buckets Necesidades, Deseos, Ahorro y omite los que no tienen filas', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({
          rowIndex: 0,
          bucket: Bucket.Ahorro,
          categoria: { id: 'cat-apv', nombre: 'APV' },
        }),
        fila({ rowIndex: 1, bucket: Bucket.Necesidades }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets.map((b) => b.bucket)).toEqual([
      Bucket.Necesidades,
      Bucket.Ahorro,
    ]);
  });

  it('ordena las categorías de un bucket por total descendente y, a igual total, por nombre', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({
          rowIndex: 0,
          cargo: 100n,
          categoria: { id: 'cat-b', nombre: 'Farmacia' },
        }),
        fila({
          rowIndex: 1,
          cargo: 900n,
          categoria: { id: 'cat-a', nombre: 'Supermercado' },
        }),
        fila({
          rowIndex: 2,
          cargo: 100n,
          categoria: { id: 'cat-c', nombre: 'Arriendo' },
        }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets[0].categorias.map((c) => c.nombre)).toEqual([
      'Supermercado',
      'Arriendo',
      'Farmacia',
    ]);
  });

  it('lista las filas de cada categoría en orden de rowIndex aunque lleguen desordenadas', () => {
    const resumen = agruparClasificacionPreview(
      [fila({ rowIndex: 7 }), fila({ rowIndex: 2 }), fila({ rowIndex: 5 })],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets[0].categorias[0].filas).toEqual([2, 5, 7]);
  });

  it('suma en BigInt sin pasar por number', () => {
    const grande = 9_007_199_254_740_993n; // 2^53 + 1: un number lo redondearía
    const resumen = agruparClasificacionPreview(
      [fila({ rowIndex: 0, cargo: grande }), fila({ rowIndex: 1, cargo: 1n })],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets[0].total).toBe(9_007_199_254_740_994n);
  });
});

describe('agruparClasificacionPreview — ingresos, duplicados y desconocidos', () => {
  it('las filas de ingreso van aparte, con conteo y total de abono, y no entran en ningún bucket', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({
          rowIndex: 0,
          cargo: 0n,
          abono: 500_000n,
          bucket: Bucket.Ingreso,
          categoria: null,
        }),
        fila({
          rowIndex: 1,
          cargo: 0n,
          abono: 20_000n,
          bucket: Bucket.Ingreso,
          categoria: null,
        }),
        fila({ rowIndex: 2 }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.ingresos).toEqual({ cantidad: 2, total: 520_000n });
    expect(resumen.buckets).toHaveLength(1);
    expect(resumen.buckets[0].cantidad).toBe(1);
  });

  it('excluye las filas duplicadas de los buckets, los ingresos y los desconocidos', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({ rowIndex: 0, esDuplicado: true }),
        fila({
          rowIndex: 1,
          esDuplicado: true,
          cargo: 0n,
          abono: 100n,
          bucket: Bucket.Ingreso,
          categoria: null,
        }),
        fila({
          rowIndex: 2,
          esDuplicado: true,
          bucket: Bucket.Deseos,
          categoria: { id: DESCONOCIDO_ID, nombre: 'Desconocido' },
        }),
        fila({ rowIndex: 3 }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.buckets).toEqual([
      {
        bucket: Bucket.Necesidades,
        cantidad: 1,
        total: 1000n,
        categorias: [
          {
            categoriaId: 'cat-super',
            nombre: 'Supermercado',
            cantidad: 1,
            total: 1000n,
            filas: [3],
          },
        ],
      },
    ]);
    expect(resumen.ingresos).toEqual({ cantidad: 0, total: 0n });
    expect(resumen.desconocidos).toBe(0);
  });

  it('cuenta como desconocidas las filas que caen en la Desconocido por defecto', () => {
    const resumen = agruparClasificacionPreview(
      [
        fila({
          rowIndex: 0,
          bucket: Bucket.Deseos,
          categoria: { id: DESCONOCIDO_ID, nombre: 'Desconocido' },
        }),
        fila({
          rowIndex: 1,
          bucket: Bucket.Deseos,
          categoria: { id: DESCONOCIDO_ID, nombre: 'Desconocido' },
        }),
        fila({ rowIndex: 2 }),
      ],
      DESCONOCIDO_ID,
    );

    expect(resumen.desconocidos).toBe(2);
    // The unknown rows are still listed under their bucket and category.
    expect(resumen.buckets[1]).toMatchObject({
      bucket: Bucket.Deseos,
      cantidad: 2,
      categorias: [{ categoriaId: DESCONOCIDO_ID, nombre: 'Desconocido' }],
    });
  });

  it('una fila de gasto sin categoría cuenta como desconocida y se lista como «Desconocido» sin id', () => {
    const resumen = agruparClasificacionPreview(
      [fila({ rowIndex: 0, bucket: Bucket.Deseos, categoria: null })],
      DESCONOCIDO_ID,
    );

    expect(resumen.desconocidos).toBe(1);
    expect(resumen.buckets[0].categorias).toEqual([
      {
        categoriaId: null,
        nombre: 'Desconocido',
        cantidad: 1,
        total: 1000n,
        filas: [0],
      },
    ]);
  });

  it('sin filas devuelve la estructura vacía', () => {
    expect(agruparClasificacionPreview([], DESCONOCIDO_ID)).toEqual({
      ingresos: { cantidad: 0, total: 0n },
      buckets: [],
      desconocidos: 0,
    });
  });
});
