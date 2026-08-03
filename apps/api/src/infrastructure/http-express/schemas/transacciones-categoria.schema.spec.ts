import { aReclasificarCategoriaDto } from '../../http/dto/reclasificar-categoria.dto';
import { Categoria } from '../../../domain/value-objects/categoria';
import { Bucket } from '../../../domain/value-objects/bucket';
import {
  transaccionesCategoriaPathParamsSchema,
  transaccionesCategoriaRequestSchema,
  transaccionesCategoriaResponseSchema,
} from './transacciones-categoria.schema';

/**
 * `transaccionesCategoriaPathParamsSchema` / `...RequestSchema` /
 * `...ResponseSchema` — Phase 10.2b rollout of the openapi-contract-express
 * change (PATCH /api/transacciones/:id/categoria, US-013 S4).
 *
 * CONTRACT-ONLY (design decision): these schemas document the transport
 * shape; they are NEVER `.safeParse()`'d at the route.
 * `registrarTransacciones` (`routes/transacciones.routes.ts`) still coerces
 * a non-string `categoria` to `''` so the domain's enum check
 * (`CategoriaInvalidaError`) rejects it uniformly — that behavior is
 * preserved exactly, not reproduced here.
 */
describe('transaccionesCategoriaPathParamsSchema', () => {
  it('accepts any non-empty string id', () => {
    const result = transaccionesCategoriaPathParamsSchema.safeParse({
      id: 'tx-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('transaccionesCategoriaRequestSchema', () => {
  it('accepts a categoria string', () => {
    const result = transaccionesCategoriaRequestSchema.safeParse({
      categoria: 'Supermercado',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing categoria', () => {
    const result = transaccionesCategoriaRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aReclasificarCategoriaDto()` mapper output, not a
 * hand-built fixture. No money fields in this DTO (id, categoria{id,nombre},
 * bucket) — confirmed against `reclasificar-categoria.dto.ts` before writing
 * this schema.
 */
describe('transaccionesCategoriaResponseSchema (sync guarantee)', () => {
  it('parses the real aReclasificarCategoriaDto mapper output', () => {
    const dto = aReclasificarCategoriaDto({
      id: 'tx-1',
      categoria: Categoria.Supermercado,
      bucket: Bucket.Necesidades,
    });

    const parsed = transaccionesCategoriaResponseSchema.parse(dto);

    expect(parsed.id).toBe('tx-1');
    expect(parsed.categoria.nombre).toBe('Supermercado');
    expect(parsed.bucket).toBe('Necesidades');
  });

  it('rejects a payload where categoria is missing its nombre field', () => {
    expect(() =>
      transaccionesCategoriaResponseSchema.parse({
        id: 'tx-1',
        categoria: { id: 'cat-1' },
        bucket: 'Necesidades',
      }),
    ).toThrow();
  });
});
