/**
 * Recursively sorts object keys alphabetically. Arrays keep their original
 * order (only their object elements get their keys sorted); primitives and
 * `null` pass through untouched.
 *
 * This is one of the 4 determinism levers for the committed `openapi.json`
 * (openapi-contract-express design): the OpenAPI document builder registers
 * endpoints/schemas in a fixed order already, but object key insertion order
 * inside a single schema can still vary by library internals — sorting keys
 * before serializing removes that last source of non-determinism.
 */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value as unknown[];
    return items.map((item) => sortKeysDeep(item)) as unknown as T;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const sortedEntries = Object.entries(value as Record<string, unknown>)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, entryValue]) => [key, sortKeysDeep(entryValue)] as const);

  return Object.fromEntries(sortedEntries) as T;
}
