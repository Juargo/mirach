import { catalogoErrorResponseSchema } from './catalogo-error.schema';

/**
 * `catalogoErrorResponseSchema` — shared non-2xx body for the 4 new catalog
 * paths (US-038, design.md Q2/§7.3). `code` is machine-readable and
 * additive: pre-existing endpoints keep `{ message }` only.
 */
describe('catalogoErrorResponseSchema', () => {
  it('accepts a { message, code } body', () => {
    const result = catalogoErrorResponseSchema.safeParse({
      message: 'La categoría no existe o no pertenece al usuario autenticado.',
      code: 'CATEGORIA_NO_ENCONTRADA',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body missing code (this schema is ONLY for the new paths)', () => {
    const result = catalogoErrorResponseSchema.safeParse({
      message: 'x',
    });
    expect(result.success).toBe(false);
  });
});
