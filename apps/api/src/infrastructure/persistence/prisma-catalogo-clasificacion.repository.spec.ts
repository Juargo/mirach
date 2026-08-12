import { PrismaCatalogoClasificacionRepository } from './prisma-catalogo-clasificacion.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';

/**
 * Fila de PatronClasificacion tal como la devuelve Prisma tras el widening
 * de `include` a `{ categoria: { include: { bucket: true } } }` (design.md
 * §4.4 correction 3, D-03): antes `include: { categoria: true }` devolvía
 * `bucketId` pero no el `nombre` del bucket, que es lo que el VO anidado
 * necesita.
 */
function makeDbRow(
  overrides?: Partial<{
    id: string;
    patron: string;
    matchType: string;
    prioridad: number;
    categoriaId: string;
    categoriaNombre: string;
    bucketNombre: Bucket;
  }>,
) {
  const data = {
    id: 'pat-1',
    patron: 'lider',
    matchType: 'CONTAINS',
    prioridad: 10,
    categoriaId: 'cat-supermercado-id',
    categoriaNombre: 'Supermercado',
    bucketNombre: Bucket.Necesidades,
    ...overrides,
  };
  return {
    id: data.id,
    patron: data.patron,
    matchType: data.matchType,
    prioridad: data.prioridad,
    categoriaId: data.categoriaId,
    categoria: {
      id: data.categoriaId,
      nombre: data.categoriaNombre,
      bucket: { nombre: data.bucketNombre },
    },
  };
}

function makePrismaMock(rows: ReturnType<typeof makeDbRow>[], throws?: Error) {
  return {
    patronClasificacion: {
      findMany: vi.fn(async () => {
        if (throws) throw throws;
        return rows;
      }),
    },
  } as unknown as PrismaClient;
}

describe('PrismaCatalogoClasificacionRepository', () => {
  describe('findAll()', () => {
    it('maps a CONTAINS row to PatronClasificacion VO correctly (nested categoria + bucket)', async () => {
      const row = makeDbRow({
        patron: 'lider',
        matchType: 'CONTAINS',
        prioridad: 10,
        categoriaId: 'cat-supermercado-id',
        categoriaNombre: 'Supermercado',
        bucketNombre: Bucket.Necesidades,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      const patrones = result.getValue();
      expect(patrones).toHaveLength(1);
      expect(patrones[0].patron).toBe('lider');
      expect(patrones[0].matchType).toBe('CONTAINS');
      expect(patrones[0].prioridad).toBe(10);
      expect(patrones[0].categoria).toEqual({
        id: 'cat-supermercado-id',
        nombre: 'Supermercado',
        bucket: Bucket.Necesidades,
      });
      expect(patrones[0].bucket).toBe(Bucket.Necesidades);
      expect(patrones[0].id).toBe('pat-1');
    });

    it('maps a STARTS_WITH row correctly', async () => {
      const row = makeDbRow({
        matchType: 'STARTS_WITH',
        categoriaId: 'cat-streaming-id',
        categoriaNombre: 'Streaming',
        bucketNombre: Bucket.Deseos,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].matchType).toBe('STARTS_WITH');
      expect(result.getValue()[0].categoria.nombre).toBe('Streaming');
      expect(result.getValue()[0].bucket).toBe(Bucket.Deseos);
    });

    it('maps a REGEX row correctly', async () => {
      const row = makeDbRow({
        matchType: 'REGEX',
        categoriaId: 'cat-ahorro-id',
        categoriaNombre: 'Ahorro',
        bucketNombre: Bucket.Ahorro,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].matchType).toBe('REGEX');
      expect(result.getValue()[0].categoria.nombre).toBe('Ahorro');
      expect(result.getValue()[0].bucket).toBe(Bucket.Ahorro);
    });

    it('maps an arbitrary user-created category name (no enum gate, ADR-037)', async () => {
      const row = makeDbRow({
        categoriaId: 'cat-mascotas-id',
        categoriaNombre: 'Mascotas',
        bucketNombre: Bucket.Deseos,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].categoria).toEqual({
        id: 'cat-mascotas-id',
        nombre: 'Mascotas',
        bucket: Bucket.Deseos,
      });
    });

    it('returns Result.ok with empty array when catalog is empty', async () => {
      const prisma = makePrismaMock([]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(0);
    });

    it('returns multiple rows mapped correctly', async () => {
      const rows = [
        makeDbRow({
          id: 'p-1',
          patron: 'lider',
          prioridad: 5,
          categoriaId: 'cat-supermercado-id',
          categoriaNombre: 'Supermercado',
        }),
        makeDbRow({
          id: 'p-2',
          patron: 'netflix',
          matchType: 'CONTAINS',
          prioridad: 10,
          categoriaId: 'cat-streaming-id',
          categoriaNombre: 'Streaming',
          bucketNombre: Bucket.Deseos,
        }),
      ];
      const prisma = makePrismaMock(rows);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(2);
      expect(result.getValue()[0].patron).toBe('lider');
      expect(result.getValue()[1].patron).toBe('netflix');
    });

    it('returns Result.fail(CategorizacionFallidaError) when Prisma throws', async () => {
      const prisma = makePrismaMock([], new Error('connection refused'));
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll('user-1');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect(result.getError().causa).toBeInstanceOf(Error);
    });

    it('never throws even when Prisma throws (returns Result.fail)', async () => {
      const prisma = makePrismaMock([], new Error('db down'));
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      await expect(repo.findAll('user-1')).resolves.toBeDefined();
      const result = await repo.findAll('user-1');
      expect(result.isFail()).toBe(true);
    });

    // US-037 CAT037-03/CA-05: el catálogo es per-user — la query DEBE filtrar
    // por userId en la BD (aislamiento estructural, RNF-SEC-006), nunca en
    // memoria. El `include` widened a `{ categoria: { include: { bucket:
    // true } } }` (design.md §4.4 correction 3) para traer el nombre del
    // bucket, no solo su bucketId.
    it('emits findMany with where: { userId } and the widened include — structural isolation (RNF-SEC-006)', async () => {
      const findMany = vi.fn(async () => []);
      const prisma = {
        patronClasificacion: { findMany },
      } as unknown as PrismaClient;
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      await repo.findAll('user-owner-of-this-catalog');

      expect(findMany).toHaveBeenCalledWith({
        where: { userId: 'user-owner-of-this-catalog' },
        include: { categoria: { include: { bucket: true } } },
        orderBy: { prioridad: 'asc' },
      });
    });
  });
});
