import { ingestaDeletePathParamsSchema } from './ingesta-delete.schema';

/**
 * `ingestaDeletePathParamsSchema` — Phase 10.2c rollout of the
 * openapi-contract-express change (DELETE /api/ingestas/:id).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors `bucketsPathParamsSchema`):
 * `id` is any non-empty string. Express guarantees path params are always
 * strings, so this is NEVER `.safeParse()`'d at the route — it exists only
 * for OpenAPI documentation completeness (`requestParams.path`). The
 * existence/ownership check (`IngestaNoEncontradaError` → anti-enumeration
 * 404) is a domain/application concern, not this schema's.
 */
describe('ingestaDeletePathParamsSchema', () => {
  it('accepts any non-empty string id', () => {
    const result = ingestaDeletePathParamsSchema.safeParse({ id: 'ing-1' });
    expect(result.success).toBe(true);
  });
});
