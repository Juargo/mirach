import { buildInfo } from '../build-info';
import { versionResponseSchema } from './version.schema';

/**
 * `versionResponseSchema` mirrors the REAL `GET /version` handler output
 * (`buildInfo`, http-express/build-info.ts) — this is the sync guarantee
 * from the openapi-contract-express design/spec: the schema doesn't just
 * describe an intended shape, it validates real production output.
 */
describe('versionResponseSchema', () => {
  it('parses the real buildInfo object without throwing', () => {
    expect(() => versionResponseSchema.parse(buildInfo)).not.toThrow();
  });

  it('rejects a payload missing a required field', () => {
    const invalid = {
      version: '1.0.0',
      commit: 'abc1234',
      ref: 'main',
      // builtAt missing
    };

    expect(() => versionResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects a payload where a field has the wrong type', () => {
    const invalid = {
      version: '1.0.0',
      commit: 'abc1234',
      ref: 'main',
      builtAt: 12345, // must be a string
    };

    expect(() => versionResponseSchema.parse(invalid)).toThrow();
  });
});
