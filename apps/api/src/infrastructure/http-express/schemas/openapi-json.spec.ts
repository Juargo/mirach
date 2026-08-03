import { openApiJsonDiverges, renderOpenApiJson } from './openapi-json';

/**
 * Pure logic behind `pnpm api openapi:emit` / `openapi:check`
 * (scripts/emit-openapi.ts is the thin fs/argv/exit-code wrapper — same
 * split as src/config/env-example.ts / scripts/gen-env-example.ts).
 */
describe('renderOpenApiJson — deterministic serialized OpenAPI document', () => {
  it('produces valid JSON parseable back into an object with the OpenAPI version', () => {
    const output = renderOpenApiJson();
    const parsed = JSON.parse(output) as { openapi: string };

    expect(parsed.openapi).toBe('3.1.0');
  });

  it('sorts top-level keys alphabetically (deterministic serialization)', () => {
    const output = renderOpenApiJson();
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
  });

  it('is byte-identical across repeated calls with no code changes (determinism)', () => {
    expect(renderOpenApiJson()).toBe(renderOpenApiJson());
  });

  it('ends with a single trailing newline', () => {
    expect(renderOpenApiJson().endsWith('\n')).toBe(true);
    expect(renderOpenApiJson().endsWith('\n\n')).toBe(false);
  });
});

describe('openApiJsonDiverges — true when committed content is stale', () => {
  it('returns false when committed content matches the current render', () => {
    expect(openApiJsonDiverges(renderOpenApiJson())).toBe(false);
  });

  it('returns true when committed content does not match the current render', () => {
    expect(openApiJsonDiverges('{}')).toBe(true);
  });
});
