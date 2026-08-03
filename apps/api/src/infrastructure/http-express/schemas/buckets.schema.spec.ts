import { aDetalleBucketDto } from '../../http/dto/detalle-bucket.dto';
import { Bucket } from '../../../domain/value-objects/bucket';
import { Categoria } from '../../../domain/value-objects/categoria';
import {
  bucketsPathParamsSchema,
  bucketsQuerySchema,
  bucketsResponseSchema,
} from './buckets.schema';

/**
 * `bucketsQuerySchema` / `bucketsResponseSchema` / `bucketsPathParamsSchema`
 * — Phase 10 rollout of the openapi-contract-express change
 * (GET /api/buckets/:bucket).
 *
 * LAYER-HONESTY GATE: neither schema encodes the valid-bucket enum check —
 * that stays a DOMAIN rule (`BucketInvalidoError`, `ObtenerDetalleBucketUseCase`).
 * The path param is transport shape only (a string); `periodo` mirrors
 * `resumen.schema.ts` (transport shape only, YYYY-MM stays domain-owned).
 */
describe('bucketsPathParamsSchema', () => {
  it('accepts any non-empty string bucket value (domain owns the enum check)', () => {
    const result = bucketsPathParamsSchema.safeParse({
      bucket: 'HackerBucket',
    });
    expect(result.success).toBe(true);
  });
});

describe('bucketsQuerySchema', () => {
  it('accepts a request with no periodo at all', () => {
    const result = bucketsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('does NOT reject a malformed-but-string periodo (domain owns YYYY-MM)', () => {
    const result = bucketsQuerySchema.safeParse({ periodo: 'garbage' });
    expect(result.success).toBe(true);
  });

  it('rejects periodo as an array (Express repeated-query shape)', () => {
    const result = bucketsQuerySchema.safeParse({
      periodo: ['2026-07', '2026-08'],
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aDetalleBucketDto()` mapper output, not a hand-built
 * fixture.
 */
describe('bucketsResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty transacciones list', () => {
    const dto = aDetalleBucketDto({
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [],
    });

    const parsed = bucketsResponseSchema.parse(dto);
    expect(parsed.bucket).toBe('Necesidades');
    expect(parsed.transacciones).toEqual([]);
  });

  it('parses the real DTO output for a transaccion with a BigInt beyond MAX_SAFE_INTEGER and a categoria', () => {
    const big = 9_007_199_254_740_993n;
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const dto = aDetalleBucketDto({
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [
        {
          id: 'tx-1',
          fecha,
          descripcion: 'Compra supermercado',
          cargo: big,
          abono: 0n,
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '****1234',
          categoria: { id: 'cat-1', nombre: Categoria.Supermercado },
        },
      ],
    });

    const parsed = bucketsResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.cargo).toBe('9007199254740993');
    expect(parsed.transacciones[0]?.categoria).toEqual({
      id: 'cat-1',
      nombre: Categoria.Supermercado,
    });
  });

  it('rejects a payload where cargo is a JSON number (never a string)', () => {
    const invalid = {
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'x',
          cargo: 100000, // must be string, not number
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '****1234',
          categoria: null,
        },
      ],
    };

    expect(() => bucketsResponseSchema.parse(invalid)).toThrow();
  });
});
