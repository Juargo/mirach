import { aCatalogoDto } from '../../http/dto/catalogo.dto';
import { aCategoriaDto } from '../../http/dto/categoria.dto';
import { Bucket } from '../../../domain/value-objects/bucket';
import {
  categoriaCreateRequestSchema,
  categoriaUpdateRequestSchema,
  categoriaIdPathParamsSchema,
  catalogoResponseSchema,
  categoriaResponseSchema,
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
    });
    expect(categoriaResponseSchema.parse(dto).patrones).toEqual([]);
  });

  it('parses the real aCatalogoDto() output', () => {
    const dto = aCatalogoDto([
      { id: 'cat-1', nombre: 'Mascotas', bucket: Bucket.Deseos, patrones: [] },
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
