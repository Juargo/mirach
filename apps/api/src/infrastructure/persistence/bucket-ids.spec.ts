import { Bucket } from '../../domain/value-objects/bucket';
import {
  BUCKET_IDS,
  ID_BUCKET_SINCATEGORIA_LEGACY,
  resolverBucket,
  construirFiltroBucket,
} from './bucket-ids';

describe('BUCKET_IDS', () => {
  it('covers all 4 Bucket enum members', () => {
    const bucketValues = Object.values(Bucket) as Bucket[];
    for (const bucket of bucketValues) {
      expect(BUCKET_IDS).toHaveProperty(bucket);
    }
  });

  it('each id is a non-empty string', () => {
    for (const [, id] of Object.entries(BUCKET_IDS)) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('all ids are unique (no duplicates)', () => {
    const ids = Object.values(BUCKET_IDS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has exactly 4 entries matching the Bucket enum (issue #778 tramo 5b: SinCategoria was removed)', () => {
    const bucketCount = Object.values(Bucket).length;
    expect(bucketCount).toBe(4);
    expect(Object.keys(BUCKET_IDS).length).toBe(bucketCount);
  });

  it('no longer has a SinCategoria entry', () => {
    expect(BUCKET_IDS).not.toHaveProperty('SinCategoria');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolverBucket / construirFiltroBucket — issue #778 tramo 5b PR5:
// `Bucket.SinCategoria` was removed from the domain entirely. A row still
// holding the legacy physical id `bucket-sincategoria` (written before this
// change, until tramo 6 migrates/wipes it) is now just another unrecognized
// bucketId, and folds to Deseos exactly like null or any other integrity
// anomaly. These are FAST, DB-less proofs of the fold itself; the DB-backed
// reconciliation across the three consumer repositories is covered by their
// own integration specs.
// ─────────────────────────────────────────────────────────────────────────
describe('resolverBucket', () => {
  it('null bucketId folds to Bucket.Deseos (issue #778 tramo 5b)', () => {
    expect(resolverBucket(null)).toBe(Bucket.Deseos);
  });

  it('unrecognized non-null bucketId folds to Bucket.Deseos (integrity anomaly, same target as null)', () => {
    expect(resolverBucket('not-a-real-bucket-id')).toBe(Bucket.Deseos);
  });

  it('the legacy bucket-sincategoria physical id ALSO folds to Bucket.Deseos (issue #778 tramo 5b PR5)', () => {
    expect(resolverBucket(ID_BUCKET_SINCATEGORIA_LEGACY)).toBe(Bucket.Deseos);
  });

  it('every other real physical id resolves to its own bucket, unaffected by the null-fold change', () => {
    expect(resolverBucket(BUCKET_IDS[Bucket.Necesidades])).toBe(
      Bucket.Necesidades,
    );
    expect(resolverBucket(BUCKET_IDS[Bucket.Deseos])).toBe(Bucket.Deseos);
    expect(resolverBucket(BUCKET_IDS[Bucket.Ahorro])).toBe(Bucket.Ahorro);
    expect(resolverBucket(BUCKET_IDS[Bucket.Ingreso])).toBe(Bucket.Ingreso);
  });
});

describe('construirFiltroBucket', () => {
  it('Bucket.Deseos includes null, the real bucket-deseos id, AND the legacy bucket-sincategoria id (reconciles with resolverBucket)', () => {
    expect(construirFiltroBucket(Bucket.Deseos)).toEqual({
      OR: [
        { bucketId: null },
        { bucketId: BUCKET_IDS[Bucket.Deseos] },
        { bucketId: ID_BUCKET_SINCATEGORIA_LEGACY },
      ],
    });
  });

  it('any other bucket filters by its own physical id only', () => {
    expect(construirFiltroBucket(Bucket.Necesidades)).toEqual({
      bucketId: BUCKET_IDS[Bucket.Necesidades],
    });
    expect(construirFiltroBucket(Bucket.Ahorro)).toEqual({
      bucketId: BUCKET_IDS[Bucket.Ahorro],
    });
  });

  it('a row with the legacy bucket-sincategoria id matches ONLY the Deseos filter, never any other bucket (no double count, no loss)', () => {
    // Every fixed bucket id (Necesidades/Deseos/Ahorro/Ingreso) is a literal
    // string that never equals the legacy SinCategoria id — so it can only
    // ever satisfy the Deseos OR-clause above, exactly once, and every
    // OTHER bucket's own-id filter naturally excludes it.
    const deseos = construirFiltroBucket(Bucket.Deseos) as {
      OR: Array<{ bucketId: string | null }>;
    };
    const deseosIds = deseos.OR.map((clause) => clause.bucketId);
    expect(deseosIds).toContain(ID_BUCKET_SINCATEGORIA_LEGACY);

    for (const bucket of [Bucket.Necesidades, Bucket.Ahorro, Bucket.Ingreso]) {
      const filtro = construirFiltroBucket(bucket) as { bucketId: string };
      expect(filtro.bucketId).not.toBe(ID_BUCKET_SINCATEGORIA_LEGACY);
    }
  });
});
