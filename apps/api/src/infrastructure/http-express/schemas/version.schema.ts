import { z } from 'zod';

/**
 * Response contract for `GET /version` (ADR-030, http-express/build-info.ts).
 * Public, no auth, no params — this is the endpoint the openapi-contract-express
 * Slice 0 uses to stand up the whole zod-openapi toolchain at zero money risk.
 *
 * `.meta({ id })` registers this as a reusable `$ref` component in the emitted
 * OpenAPI document (zod-openapi@5.4.2) instead of an inline schema.
 */
export const versionResponseSchema = z
  .object({
    version: z.string().describe('Package version (release-please, ADR-030).'),
    commit: z.string().describe('Short commit SHA, or "local" outside Render.'),
    ref: z.string().describe('Git branch/ref, or "local" outside Render.'),
    builtAt: z
      .string()
      .describe('ISO-8601 timestamp of when this process booted.'),
  })
  .meta({
    id: 'VersionResponse',
    description: 'Deployed build info for the API — GET /version.',
  });
