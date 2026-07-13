import { PrismaCatalogoClasificacionRepository } from './prisma-catalogo-clasificacion.repository';
import { PrismaService } from './prisma.service';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BUCKET_IDS } from './bucket-ids';

/** Fila de PatronClasificacion tal como la devuelve Prisma (incluye relación bucket). */
function makeDbRow(
  overrides?: Partial<{
    id: string;
    patron: string;
    matchType: string;
    prioridad: number;
    bucketId: string;
    bucketNombre: string;
  }>,
) {
  const data = {
    id: 'pat-1',
    patron: 'lider',
    matchType: 'CONTAINS',
    prioridad: 10,
    bucketId: BUCKET_IDS[Bucket.Necesidades],
    bucketNombre: Bucket.Necesidades,
    ...overrides,
  };
  return {
    id: data.id,
    patron: data.patron,
    matchType: data.matchType,
    prioridad: data.prioridad,
    bucketId: data.bucketId,
    bucket: {
      id: data.bucketId,
      nombre: data.bucketNombre,
      patrones: [],
      transacciones: [],
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
  } as unknown as PrismaService;
}

describe('PrismaCatalogoClasificacionRepository', () => {
  describe('findAll()', () => {
    it('maps a CONTAINS row to PatronClasificacion VO correctly', async () => {
      const row = makeDbRow({
        patron: 'lider',
        matchType: 'CONTAINS',
        prioridad: 10,
        bucketNombre: Bucket.Necesidades,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isOk()).toBe(true);
      const patrones = result.getValue();
      expect(patrones).toHaveLength(1);
      expect(patrones[0].patron).toBe('lider');
      expect(patrones[0].matchType).toBe('CONTAINS');
      expect(patrones[0].prioridad).toBe(10);
      expect(patrones[0].bucket).toBe(Bucket.Necesidades);
      expect(patrones[0].id).toBe('pat-1');
    });

    it('maps a STARTS_WITH row correctly', async () => {
      const row = makeDbRow({
        matchType: 'STARTS_WITH',
        bucketNombre: Bucket.Deseos,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].matchType).toBe('STARTS_WITH');
      expect(result.getValue()[0].bucket).toBe(Bucket.Deseos);
    });

    it('maps a REGEX row correctly', async () => {
      const row = makeDbRow({
        matchType: 'REGEX',
        bucketNombre: Bucket.Ahorro,
      });
      const prisma = makePrismaMock([row]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].matchType).toBe('REGEX');
      expect(result.getValue()[0].bucket).toBe(Bucket.Ahorro);
    });

    it('returns Result.ok with empty array when catalog is empty', async () => {
      const prisma = makePrismaMock([]);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(0);
    });

    it('returns multiple rows mapped correctly', async () => {
      const rows = [
        makeDbRow({
          id: 'p-1',
          patron: 'lider',
          prioridad: 5,
          bucketNombre: Bucket.Necesidades,
        }),
        makeDbRow({
          id: 'p-2',
          patron: 'netflix',
          matchType: 'CONTAINS',
          prioridad: 10,
          bucketNombre: Bucket.Deseos,
        }),
      ];
      const prisma = makePrismaMock(rows);
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(2);
      expect(result.getValue()[0].patron).toBe('lider');
      expect(result.getValue()[1].patron).toBe('netflix');
    });

    it('returns Result.fail(CategorizacionFallidaError) when Prisma throws', async () => {
      const prisma = makePrismaMock([], new Error('connection refused'));
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      const result = await repo.findAll();

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect(result.getError().causa).toBeInstanceOf(Error);
    });

    it('never throws even when Prisma throws (returns Result.fail)', async () => {
      const prisma = makePrismaMock([], new Error('db down'));
      const repo = new PrismaCatalogoClasificacionRepository(prisma);

      await expect(repo.findAll()).resolves.toBeDefined();
      const result = await repo.findAll();
      expect(result.isFail()).toBe(true);
    });
  });
});
