import { objetivosDeP2002 } from './p2002-objetivos';

/**
 * objetivosDeP2002 — normaliza el `meta` de un P2002 a una lista plana de
 * strings, cubriendo las TRES formas que este repo ya documentó como reales
 * (ver el docblock del módulo). Extraído de `esCarreraDeCreacionUser`
 * (`prisma-identidad-google.repository.ts`) para que `prisma-categoria.
 * repository.ts` no fuera una TERCERA copia del mismo recorrido de `meta`.
 */
describe('objetivosDeP2002', () => {
  it('devuelve [] cuando no hay ninguna forma reconocible (meta ausente)', () => {
    expect(objetivosDeP2002(undefined)).toEqual([]);
    expect(objetivosDeP2002(null)).toEqual([]);
    expect(objetivosDeP2002({})).toEqual([]);
  });

  it('acepta meta.target como string[] (forma clásica: nombres de columna)', () => {
    expect(
      objetivosDeP2002({ target: ['userId', 'bucketId', 'nombre'] }),
    ).toEqual(['userId', 'bucketId', 'nombre']);
  });

  it('acepta meta.target como string (forma histórica: nombre del constraint)', () => {
    expect(
      objetivosDeP2002({ target: 'Categoria_userId_bucketId_nombre_key' }),
    ).toEqual(['Categoria_userId_bucketId_nombre_key']);
  });

  it('descarta entradas no-string dentro de meta.target', () => {
    expect(objetivosDeP2002({ target: ['nombre', 42, null] })).toEqual([
      'nombre',
    ]);
  });

  it('acepta la forma REAL de Prisma 7 + @prisma/adapter-pg: constraint.fields (columnas citadas por Postgres)', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          constraint: { fields: ['"userId"', '"bucketId"', '"nombre"'] },
        },
      },
    };

    expect(objetivosDeP2002(meta)).toEqual([
      '"userId"',
      '"bucketId"',
      '"nombre"',
    ]);
  });

  it('acepta driverAdapterError.cause.originalMessage (texto crudo del constraint)', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          originalMessage:
            'duplicate key value violates unique constraint "Categoria_userId_bucketId_nombre_key"',
        },
      },
    };

    expect(objetivosDeP2002(meta)).toEqual([
      'duplicate key value violates unique constraint "Categoria_userId_bucketId_nombre_key"',
    ]);
  });

  it('acumula TODAS las formas presentes a la vez, sin priorizar una sobre otra', () => {
    const meta = {
      target: ['nombre'],
      driverAdapterError: {
        cause: {
          constraint: { fields: ['"bucketId"'] },
          originalMessage: 'violates unique constraint "Categoria_..._key"',
        },
      },
    };

    expect(objetivosDeP2002(meta)).toEqual([
      'nombre',
      '"bucketId"',
      'violates unique constraint "Categoria_..._key"',
    ]);
  });
});
