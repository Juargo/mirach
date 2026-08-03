import { sortKeysDeep } from './sort-keys-deep';

/**
 * `sortKeysDeep` is one of the 4 determinism levers for the emitted
 * `openapi.json` (see openapi-contract-express design): re-emitting the same
 * document must always produce byte-identical output, regardless of the
 * insertion order the OpenAPI library used internally.
 */
describe('sortKeysDeep — deterministic recursive key sorting', () => {
  it('sorts a flat object keys alphabetically', () => {
    const input = { zebra: 1, apple: 2, mango: 3 };

    expect(sortKeysDeep(input)).toEqual({ apple: 2, mango: 3, zebra: 1 });
    expect(Object.keys(sortKeysDeep(input))).toEqual([
      'apple',
      'mango',
      'zebra',
    ]);
  });

  it('sorts nested object keys recursively', () => {
    const input = {
      z: { y: 1, x: 2 },
      a: 1,
    };

    expect(Object.keys(sortKeysDeep(input))).toEqual(['a', 'z']);
    expect(Object.keys(sortKeysDeep(input).z as object)).toEqual(['x', 'y']);
  });

  it('preserves array order but sorts keys of object elements inside arrays', () => {
    const input = {
      list: [
        { b: 1, a: 2 },
        { d: 1, c: 2 },
      ],
    };

    const result = sortKeysDeep(input) as { list: unknown[] };

    expect(result.list).toHaveLength(2);
    expect(Object.keys(result.list[0] as object)).toEqual(['a', 'b']);
    expect(Object.keys(result.list[1] as object)).toEqual(['c', 'd']);
  });

  it('leaves primitives and null untouched', () => {
    expect(sortKeysDeep('a string')).toBe('a string');
    expect(sortKeysDeep(42)).toBe(42);
    expect(sortKeysDeep(true)).toBe(true);
    expect(sortKeysDeep(null)).toBeNull();
  });

  it('does not mutate the input', () => {
    const input = { zebra: 1, apple: 2 };
    sortKeysDeep(input);

    expect(Object.keys(input)).toEqual(['zebra', 'apple']);
  });
});
