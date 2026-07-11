import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

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
      expect((id as string).length).toBeGreaterThan(0);
    }
  });

  it('all ids are unique (no duplicates)', () => {
    const ids = Object.values(BUCKET_IDS) as string[];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has exactly 5 entries matching the Bucket enum', () => {
    const bucketCount = Object.values(Bucket).length;
    expect(Object.keys(BUCKET_IDS).length).toBe(bucketCount);
  });
});
