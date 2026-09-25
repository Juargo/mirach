import { Bucket } from '../../domain/value-objects/bucket';
import {
  BUCKET_IDS,
  resolverBucket,
  construirFiltroBucket,
} from './bucket-ids';

describe('BUCKET_IDS', () => {
  it('covers all 5 Bucket enum members', () => {
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

  it('has exactly 5 entries matching the Bucket enum', () => {
    const bucketCount = Object.values(Bucket).length;
    expect(Object.keys(BUCKET_IDS).length).toBe(bucketCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolverBucket / construirFiltroBucket — issue #778 tramo 5b: the
// null-bucket read fold moved from SinCategoria to Deseos. These are FAST,
// DB-less proofs of the fold itself; the DB-backed reconciliation across the
// three consumer repositories is covered by their own integration specs.
// ─────────────────────────────────────────────────────────────────────────
describe('resolverBucket', () => {
  it('null bucketId folds to Bucket.Deseos (issue #778 tramo 5b)', () => {
    expect(resolverBucket(null)).toBe(Bucket.Deseos);
  });

  it('unrecognized non-null bucketId folds to Bucket.Deseos (integrity anomaly, same target as null)', () => {
    expect(resolverBucket('not-a-real-bucket-id')).toBe(Bucket.Deseos);
  });

  it('the REAL bucket-sincategoria physical id still resolves to Bucket.SinCategoria', () => {
    expect(resolverBucket(BUCKET_IDS[Bucket.SinCategoria])).toBe(
      Bucket.SinCategoria,
    );
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
  it('Bucket.Deseos includes both null AND the real bucket-deseos id (reconciles with resolverBucket)', () => {
    expect(construirFiltroBucket(Bucket.Deseos)).toEqual({
      OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.Deseos] }],
    });
  });

  it('Bucket.SinCategoria matches ONLY the real bucket-sincategoria id — no OR with null', () => {
    const filtro = construirFiltroBucket(Bucket.SinCategoria);
    expect(filtro).toEqual({ bucketId: BUCKET_IDS[Bucket.SinCategoria] });
    // Explicit negative: proves this can fail — reverting to the old
    // `OR: [{bucketId: null}, ...]` shape for SinCategoria would still
    // satisfy a looser assertion, but not this exact-shape one.
    expect(filtro).not.toHaveProperty('OR');
  });

  it('any other bucket filters by its own physical id only', () => {
    expect(construirFiltroBucket(Bucket.Necesidades)).toEqual({
      bucketId: BUCKET_IDS[Bucket.Necesidades],
    });
    expect(construirFiltroBucket(Bucket.Ahorro)).toEqual({
      bucketId: BUCKET_IDS[Bucket.Ahorro],
    });
  });

  it('SinCategoria and Deseos filters partition null vs non-null bucketId — never overlap', () => {
    // Every possible bucketId value must match EXACTLY ONE of the two
    // filters below, or the same transaction would render on two detail
    // screens (double count).
    const deseos = construirFiltroBucket(Bucket.Deseos) as {
      OR: Array<{ bucketId: string | null }>;
    };
    const sinCategoria = construirFiltroBucket(Bucket.SinCategoria) as {
      bucketId: string;
    };

    const deseosIds = deseos.OR.map((clause) => clause.bucketId);
    expect(deseosIds).toContain(null);
    expect(deseosIds).not.toContain(sinCategoria.bucketId);
  });
});
