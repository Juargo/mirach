import { buildOpenApiDocument } from './openapi-document';
import { sortKeysDeep } from './sort-keys-deep';

/**
 * Pure serialization of the OpenAPI document, applying all 4 determinism
 * levers from the openapi-contract-express design: exact library pin,
 * fixed-order registration (`openapi-document.ts`), deep key sorting
 * (`sortKeysDeep`), and fixed formatting (2-space indent + single trailing
 * newline). Same code, same output, always — this is what makes
 * `openapi:emit` idempotent and `openapi:check` a reliable CI drift-check.
 *
 * The fs/argv/exit-code wrapper lives in `scripts/emit-openapi.ts` (mirrors
 * `src/config/env-example.ts` / `scripts/gen-env-example.ts`).
 */
export function renderOpenApiJson(): string {
  const sorted = sortKeysDeep(buildOpenApiDocument());
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * `true` if `committedContent` (the `openapi.json` as committed in the repo)
 * no longer matches what the current schemas would emit — the pure logic
 * behind `openapi:check`'s CI-failing exit code.
 */
export function openApiJsonDiverges(committedContent: string): boolean {
  return committedContent !== renderOpenApiJson();
}
