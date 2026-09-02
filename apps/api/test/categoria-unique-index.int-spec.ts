import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';

/**
 * categoria-unique-index.int-spec.ts — categoria-unica-por-bucket (ADR-042),
 * D-09/CAT038-13.
 *
 * Schema-level assertion, not a behavioural one: the migration widens
 * `Categoria`'s uniqueness key from `(userId, nombre)` to
 * `(userId, bucketId, nombre)`. This can only be proven against the REAL
 * Postgres catalog (`pg_indexes`) — a mocked Prisma client has no index to
 * inspect. Mirrors the same two-sided assertion pattern already used by
 * `us037-catalogo-rehearsal.ts:301-304` (assert new present + old absent).
 */
describe('Categoria unique index (ADR-042, CAT038-13)', () => {
  const prisma = createPrismaClient(loadEnv());

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('the new (userId, bucketId, nombre) unique index exists; the old (userId, nombre) one does not', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Categoria'
    `;
    const indexNames = indexes.map((row) => row.indexname);

    expect(indexNames).toContain('Categoria_userId_bucketId_nombre_key');
    expect(indexNames).not.toContain('Categoria_userId_nombre_key');
  });
});
