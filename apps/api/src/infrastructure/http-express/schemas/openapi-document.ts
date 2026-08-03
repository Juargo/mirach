import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createDocument,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
} from 'zod-openapi';

import { versionResponseSchema } from './version.schema';
import { resumenQuerySchema, resumenResponseSchema } from './resumen.schema';
import {
  resumenAnualQuerySchema,
  resumenAnualResponseSchema,
} from './resumen-anual.schema';
import {
  movimientosQuerySchema,
  movimientosResponseSchema,
} from './movimientos.schema';
import {
  bucketsPathParamsSchema,
  bucketsQuerySchema,
  bucketsResponseSchema,
} from './buckets.schema';

/**
 * `buildOpenApiDocument()` is the single source of the OpenAPI 3.1.0 contract
 * (openapi-contract-express design, ADR-011 amend). It is PURE — no
 * container, no env, no DB — so it can run at build time
 * (`scripts/emit-openapi.ts`, against the `api` CI job that has no
 * database) and in unit tests alike.
 *
 * `version` is read from package.json the same way `build-info.ts` reads it
 * (fs, not `import`, to stay inside `rootDir: src` — TS6059) — this is
 * static repo metadata, not runtime/env state, so it does not break purity.
 */
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../../../package.json'), 'utf8'),
) as { version: string };

const versionOperation: ZodOpenApiOperationObject = {
  summary: 'Deployed build info',
  description:
    'Public, unauthenticated endpoint exposing the currently deployed build (ADR-030).',
  responses: {
    '200': {
      description: 'Build info for the currently deployed API instance.',
      content: {
        'application/json': { schema: versionResponseSchema },
      },
    },
  },
};

const resumenOperation: ZodOpenApiOperationObject = {
  summary: 'Monthly 50/30/20 breakdown',
  description:
    'Authenticated endpoint returning the 50/30/20 budget breakdown for a month (US-015/016). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: resumenQuerySchema,
  },
  responses: {
    '200': {
      description: 'Monthly resumen for the resolved period.',
      content: {
        'application/json': { schema: resumenResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).',
    },
  },
};

const resumenAnualOperation: ZodOpenApiOperationObject = {
  summary: 'Annual 50/30/20 breakdown',
  description:
    'Authenticated endpoint returning the 50/30/20 budget breakdown for all 12 months of a year (US-030). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: resumenAnualQuerySchema,
  },
  responses: {
    '200': {
      description: 'Annual resumen for the resolved year.',
      content: {
        'application/json': { schema: resumenAnualResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid anio — either a transport-shape mismatch or a malformed/out-of-range value (domain-level).',
    },
  },
};

const movimientosOperation: ZodOpenApiOperationObject = {
  summary: 'Monthly transaction list',
  description:
    'Authenticated endpoint returning the consolidated monthly transaction list (US-014). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: movimientosQuerySchema,
  },
  responses: {
    '200': {
      description: 'Monthly transaction list for the resolved period.',
      content: {
        'application/json': { schema: movimientosResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).',
    },
  },
};

const bucketsOperation: ZodOpenApiOperationObject = {
  summary: 'Bucket drill-down',
  description:
    'Authenticated endpoint returning the transaction detail for a single spend bucket (US-017). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    path: bucketsPathParamsSchema,
    query: bucketsQuerySchema,
  },
  responses: {
    '200': {
      description: 'Bucket detail for the resolved period.',
      content: {
        'application/json': { schema: bucketsResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid bucket (unrecognized value) or invalid periodo — both domain-level (BucketInvalidoError / PeriodoInvalidoError).',
    },
  },
};

/**
 * Explicit, FIXED-ORDER registration — one entry per endpoint. This order is
 * part of the determinism contract (openapi-contract-express design):
 * appending future endpoints (Slice 1+) must append here, never reorder
 * entries already registered, so `openapi:check` only ever diffs genuine
 * contract changes.
 */
const paths: ZodOpenApiPathsObject = {
  '/version': { get: versionOperation },
  '/api/resumen': { get: resumenOperation },
  '/api/resumen/anual': { get: resumenAnualOperation },
  '/api/movimientos': { get: movimientosOperation },
  '/api/buckets/{bucket}': { get: bucketsOperation },
};

export function buildOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'MoneyDiary API',
      version: pkg.version,
      description:
        'HTTP contract for the MoneyDiary Express API, sourced from Zod schemas (ADR-011 amend).',
    },
    paths,
  });
}
