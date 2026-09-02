import type { PrismaClient } from '@prisma/client';
import { Bucket } from '../../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../../src/infrastructure/persistence/bucket-ids';

/**
 * categoria-fixture.ts — categoria-unica-por-bucket (ADR-042), D-10.
 *
 * Resolves the REAL per-user id of a seeded Categoria (US-037: there is no
 * global fixed id per categoria). Under ADR-042 a nombre alone no longer
 * identifies a row, so the BUCKET IS REQUIRED — this helper cannot be
 * copy-pasted into runtime code as a name-only lookup, by construction (the
 * forbidden shape design.md D-05 names explicitly: `findFirst({ userId,
 * nombre })` compiles, type-checks, and returns one of N same-named rows
 * across buckets, chosen by the database).
 */
export async function categoriaIdDe(
  prisma: PrismaClient,
  criterio: { userId: string; bucket: Bucket; nombre: string },
): Promise<string> {
  const row = await prisma.categoria.findFirstOrThrow({
    where: {
      userId: criterio.userId,
      bucketId: BUCKET_IDS[criterio.bucket],
      nombre: criterio.nombre,
    },
    select: { id: true },
  });
  return row.id;
}
