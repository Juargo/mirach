import { aPatronDto } from '../../http/dto/patron.dto';
import {
  patronCreateRequestSchema,
  patronUpdateRequestSchema,
  patronIdPathParamsSchema,
  patronResponseSchema,
} from './patrones.schema';

describe('patronCreateRequestSchema', () => {
  it('accepts { categoriaId, patron, matchType, prioridad }', () => {
    const result = patronCreateRequestSchema.safeParse({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 50,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a request with prioridad omitted (optional, use-case default)', () => {
    const result = patronCreateRequestSchema.safeParse({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });
    expect(result.success).toBe(true);
  });

  it('does NOT validate matchType membership (domain owns the enum check)', () => {
    const result = patronCreateRequestSchema.safeParse({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'FUZZY',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown/typo field — .strict()', () => {
    const result = patronCreateRequestSchema.safeParse({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      bucket: 'sneaky',
    });
    expect(result.success).toBe(false);
  });
});

describe('patronUpdateRequestSchema (PATCH, partial body — Q4)', () => {
  it('accepts patron-only', () => {
    expect(patronUpdateRequestSchema.safeParse({ patron: 'x' }).success).toBe(
      true,
    );
  });

  it('rejects an empty body — .refine() "at least one field" (Q4)', () => {
    expect(patronUpdateRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects categoriaId — moving a pattern between categories is a non-goal', () => {
    const result = patronUpdateRequestSchema.safeParse({
      categoriaId: 'cat-2',
    });
    expect(result.success).toBe(false);
  });
});

describe('patronIdPathParamsSchema', () => {
  it('accepts any non-empty string id', () => {
    expect(patronIdPathParamsSchema.safeParse({ id: 'pat-1' }).success).toBe(
      true,
    );
  });
});

describe('patronResponseSchema (sync guarantee)', () => {
  it('parses the real aPatronDto() output', () => {
    const dto = aPatronDto({
      id: 'pat-1',
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    });
    expect(patronResponseSchema.parse(dto)).toEqual(dto);
  });
});
