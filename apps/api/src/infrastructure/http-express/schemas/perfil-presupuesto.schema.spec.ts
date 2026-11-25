import { describe, expect, it } from 'vitest';
import { PERFILES_PREDEFINIDOS } from '../../../domain/value-objects/perfil-presupuesto';
import { perfilPresupuestoUpdateRequestSchema } from './perfil-presupuesto.schema';

describe('perfilPresupuestoUpdateRequestSchema (PER-03)', () => {
  it.each(['50_30_20', '65_20_15', '80_10_10', '90_5_5'])(
    'accepts the predefined profile %s',
    (perfil) => {
      const r = perfilPresupuestoUpdateRequestSchema.safeParse({ perfil });
      expect(r.success).toBe(true);
    },
  );

  it.each(['60_20_20', '70_15_15'])(
    'rejects the retired profile %s',
    (perfil) => {
      const r = perfilPresupuestoUpdateRequestSchema.safeParse({ perfil });
      expect(r.success).toBe(false);
    },
  );

  it('accepts exactly the ids the domain defines', () => {
    for (const perfil of Object.keys(PERFILES_PREDEFINIDOS)) {
      const r = perfilPresupuestoUpdateRequestSchema.safeParse({ perfil });
      expect(r.success).toBe(true);
    }
  });
});
