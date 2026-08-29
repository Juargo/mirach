import { movimientoDeletePathParamsSchema } from './movimiento-delete.schema';

/**
 * `movimientoDeletePathParamsSchema` — correccion-movimientos-manuales,
 * D-01b.
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors
 * `ingestaDeletePathParamsSchema`): `id` is any non-empty string.
 */
describe('movimientoDeletePathParamsSchema', () => {
  it('accepts any non-empty string id', () => {
    const result = movimientoDeletePathParamsSchema.safeParse({ id: 'tx-1' });
    expect(result.success).toBe(true);
  });
});
