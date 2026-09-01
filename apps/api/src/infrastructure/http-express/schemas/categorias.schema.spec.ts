import { aCatalogoDto } from '../../http/dto/catalogo.dto';
import { aCategoriaDto } from '../../http/dto/categoria.dto';
import { Bucket } from '../../../domain/value-objects/bucket';
import {
  categoriaCreateRequestSchema,
  categoriaUpdateRequestSchema,
  categoriaIdPathParamsSchema,
  catalogoResponseSchema,
  categoriaResponseSchema,
  patronEnCategoriaCreateSchema,
} from './categorias.schema';

/**
 * TRANSPORT SHAPE ONLY (layer-honesty gate, design.md §5.2/§7.2): no enum
 * membership, no length/range checks here — those are domain rules owned
 * by the use cases. `bucket`/`matchType` stay `z.string()`.
 */
describe('categoriaCreateRequestSchema', () => {
  it('accepts { nombre, bucket }', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });
    expect(result.success).toBe(true);
  });

  it('does NOT validate bucket membership (domain owns the enum check)', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'NotARealBucket',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown/typo field — .strict() (D-09)', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      categoriaId: 'sneaky',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an optional patrones[] array (CAT038-10)', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'petco', matchType: 'CONTAINS' }],
    });
    expect(result.success).toBe(true);
  });

  it('omitting patrones stays valid (backward compat, mobile ADR-038)', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });
    expect(result.success).toBe(true);
  });

  it('an empty patrones[] array is valid', () => {
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });
    expect(result.success).toBe(true);
  });
});

/**
 * patronEnCategoriaCreateSchema — TRANSPORT SHAPE ONLY, same layer-honesty
 * gate as categoriaCreateRequestSchema (design.md D-04). `.max(20)` is a
 * REQUEST-SIZE guard (generic BODY_INVALIDO), not a business rule; the
 * per-entry format rules (length, matchType enum, REGEX compile) are
 * domain (`validarPatron`), never duplicated here.
 */
describe('patronEnCategoriaCreateSchema', () => {
  it('accepts { patron, matchType } — .strict()', () => {
    const result = patronEnCategoriaCreateSchema.safeParse({
      patron: 'petco',
      matchType: 'CONTAINS',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a caller-supplied prioridad — server always defaults to 100 (D-04)', () => {
    const result = patronEnCategoriaCreateSchema.safeParse({
      patron: 'petco',
      matchType: 'CONTAINS',
      prioridad: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field — .strict()', () => {
    const result = patronEnCategoriaCreateSchema.safeParse({
      patron: 'petco',
      matchType: 'CONTAINS',
      sneaky: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('does NOT validate matchType membership (domain owns the enum check)', () => {
    const result = patronEnCategoriaCreateSchema.safeParse({
      patron: 'petco',
      matchType: 'NotARealMatchType',
    });
    expect(result.success).toBe(true);
  });

  it('categoriaCreateRequestSchema caps patrones at 20 entries (request-size guard, D-04)', () => {
    const patrones = Array.from({ length: 21 }, (_, i) => ({
      patron: `p-${i}`,
      matchType: 'CONTAINS',
    }));
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones,
    });
    expect(result.success).toBe(false);
  });

  it('categoriaCreateRequestSchema accepts exactly 20 entries', () => {
    const patrones = Array.from({ length: 20 }, (_, i) => ({
      patron: `p-${i}`,
      matchType: 'CONTAINS',
    }));
    const result = categoriaCreateRequestSchema.safeParse({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones,
    });
    expect(result.success).toBe(true);
  });
});

describe('categoriaUpdateRequestSchema (PATCH, partial body — Q4)', () => {
  it('accepts nombre-only', () => {
    expect(
      categoriaUpdateRequestSchema.safeParse({ nombre: 'x' }).success,
    ).toBe(true);
  });

  it('accepts bucket-only', () => {
    expect(
      categoriaUpdateRequestSchema.safeParse({ bucket: 'Necesidades' }).success,
    ).toBe(true);
  });

  it('rejects an empty body — .refine() "at least one field" (Q4)', () => {
    expect(categoriaUpdateRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown field — .strict()', () => {
    expect(
      categoriaUpdateRequestSchema.safeParse({ nombre: 'x', id: 'sneaky' })
        .success,
    ).toBe(false);
  });
});

describe('categoriaIdPathParamsSchema', () => {
  it('accepts any non-empty string id', () => {
    expect(categoriaIdPathParamsSchema.safeParse({ id: 'cat-1' }).success).toBe(
      true,
    );
  });
});

/**
 * Sync guarantee (buckets.schema.spec.ts precedent): validated against the
 * REAL DTO mapper output, not a hand-built fixture.
 */
describe('categoriaResponseSchema / catalogoResponseSchema (sync guarantee)', () => {
  it('parses the real aCategoriaDto() output — a zero-pattern category (CA-03)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 0,
    });
    expect(categoriaResponseSchema.parse(dto).patrones).toEqual([]);
  });

  it('a non-zero transaccionesCount survives aCategoriaDto() → schema parse unchanged (CAT039-01)', () => {
    const dto = aCategoriaDto({
      id: 'cat-1',
      nombre: 'Mascotas',
      bucket: Bucket.Deseos,
      patrones: [],
      transaccionesCount: 7,
    });
    expect(categoriaResponseSchema.parse(dto).transaccionesCount).toBe(7);
  });

  it('parses the real aCatalogoDto() output', () => {
    const dto = aCatalogoDto([
      {
        id: 'cat-1',
        nombre: 'Mascotas',
        bucket: Bucket.Deseos,
        patrones: [],
        transaccionesCount: 0,
      },
    ]);
    expect(catalogoResponseSchema.parse(dto).categorias).toHaveLength(1);
  });

  it('rejects a payload with a numeric money field anywhere (CA-06, vacuous but pinned)', () => {
    const invalid = {
      categorias: [
        {
          id: 'cat-1',
          nombre: 'Mascotas',
          bucket: 'Deseos',
          patrones: [],
          transaccionesCount: 0,
          monto: 1000, // must never appear
        },
      ],
    };
    // additionalProperties are silently stripped by non-strict object
    // schemas — assert the accepted shape has NO money-shaped field, not
    // that parsing throws.
    const parsed = catalogoResponseSchema.parse(invalid);
    expect(
      (parsed.categorias[0] as Record<string, unknown>).monto,
    ).toBeUndefined();
  });
});
