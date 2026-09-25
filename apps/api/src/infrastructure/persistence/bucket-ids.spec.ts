import { Bucket } from '../../domain/value-objects/bucket';
import {
  BUCKET_IDS,
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
// `Bucket.SinCategoria` was removed from the domain entirely; tramo 5b PR6
// migrated every row that carried the legacy physical id `bucket-sincategoria`
// to `bucket-deseos` and DELETED that `BucketPresupuesto` row — the FK now
// makes that literal id physically impossible to write again. What remains is
// a purely DEFENSIVE fold: any bucketId that isn't null and isn't one of the
// 4 real ids (an integrity anomaly that should never happen behind the FK)
// folds to Deseos, exactly like null. These are FAST, DB-less proofs of the
// fold itself; the DB-backed reconciliation across the three consumer
// repositories is covered by their own integration specs.
// ─────────────────────────────────────────────────────────────────────────
describe('resolverBucket', () => {
  it('null bucketId folds to Bucket.Deseos (issue #778 tramo 5b)', () => {
    expect(resolverBucket(null)).toBe(Bucket.Deseos);
  });

  it('unrecognized non-null bucketId folds to Bucket.Deseos (integrity anomaly, same target as null)', () => {
    expect(resolverBucket('not-a-real-bucket-id')).toBe(Bucket.Deseos);
  });

  it('even the literal retired legacy id "bucket-sincategoria" is just another unrecognized id now — folds to Deseos, not special-cased (issue #778 tramo 5b PR6)', () => {
    expect(resolverBucket('bucket-sincategoria')).toBe(Bucket.Deseos);
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
  it('Bucket.Deseos includes null AND the real bucket-deseos id — exactly 2 clauses, no legacy id (issue #778 tramo 5b PR6)', () => {
    expect(construirFiltroBucket(Bucket.Deseos)).toEqual({
      OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.Deseos] }],
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

  it('reconciles with resolverBucket: every clause in the Deseos OR resolves to Deseos, and no other bucket filter ever matches null', () => {
    const deseos = construirFiltroBucket(Bucket.Deseos) as {
      OR: Array<{ bucketId: string | null }>;
    };
    for (const clause of deseos.OR) {
      expect(resolverBucket(clause.bucketId)).toBe(Bucket.Deseos);
    }

    for (const bucket of [Bucket.Necesidades, Bucket.Ahorro, Bucket.Ingreso]) {
      const filtro = construirFiltroBucket(bucket) as { bucketId: string };
      expect(filtro.bucketId).not.toBeNull();
      expect(resolverBucket(filtro.bucketId)).toBe(bucket);
    }
  });
});
