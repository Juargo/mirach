import { aMovimientosMesDto } from '../../http/dto/movimiento-mes.dto';
import { Bucket } from '../../../domain/value-objects/bucket';
import {
  movimientosQuerySchema,
  movimientosResponseSchema,
} from './movimientos.schema';

/**
 * `movimientosQuerySchema` / `movimientosResponseSchema` — Phase 10 rollout
 * of the openapi-contract-express change (GET /api/movimientos).
 *
 * LAYER-HONESTY GATE: the query schema validates TRANSPORT SHAPE ONLY,
 * mirrors `resumen.schema.ts` — `periodo` format is a DOMAIN rule
 * (`PeriodoMes` VO / `PeriodoInvalidoError`) and MUST NOT be duplicated here.
 */
describe('movimientosQuerySchema', () => {
  it('accepts a request with no periodo at all', () => {
    const result = movimientosQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts periodo as a well-formed string', () => {
    const result = movimientosQuerySchema.safeParse({ periodo: '2026-07' });
    expect(result.success).toBe(true);
  });

  it('does NOT reject a malformed-but-string periodo (domain owns YYYY-MM)', () => {
    const result = movimientosQuerySchema.safeParse({ periodo: 'garbage' });
    expect(result.success).toBe(true);
  });

  it('rejects periodo as an array (Express repeated-query shape)', () => {
    const result = movimientosQuerySchema.safeParse({
      periodo: ['2026-07', '2026-08'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects periodo as an object', () => {
    const result = movimientosQuerySchema.safeParse({
      periodo: { foo: 'bar' },
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aMovimientosMesDto()` mapper output, not a hand-built
 * fixture.
 */
describe('movimientosResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty list', () => {
    const dto = aMovimientosMesDto({ periodo: '2026-07', transacciones: [] });

    const parsed = movimientosResponseSchema.parse(dto);
    expect(parsed.periodo).toBe('2026-07');
    expect(parsed.totalTransacciones).toBe(0);
    expect(parsed.transacciones).toEqual([]);
  });

  it('parses the real DTO output for a movimiento with a BigInt beyond MAX_SAFE_INTEGER and a categoria', () => {
    const big = 9_007_199_254_740_993n;
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const dto = aMovimientosMesDto({
      periodo: '2026-07',
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
          bucket: Bucket.Necesidades,
          categoria: { id: 'cat-1', nombre: 'Supermercado' },
        },
      ],
    });

    const parsed = movimientosResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.cargo).toBe('9007199254740993');
    expect(parsed.transacciones[0]?.categoria).toEqual({
      id: 'cat-1',
      nombre: 'Supermercado',
    });
  });

  it('parses the real DTO output for a movimiento with categoria=null (Ingreso/SinCategoria)', () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const dto = aMovimientosMesDto({
      periodo: '2026-07',
      transacciones: [
        {
          id: 'tx-2',
          fecha,
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 1_500_000n,
          banco: 'BCI',
          tipoCuenta: 'Corriente',
          numeroCuenta: '****5678',
          bucket: Bucket.Ingreso,
          categoria: null,
        },
      ],
    });

    const parsed = movimientosResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.categoria).toBeNull();
  });

  it('rejects a payload where cargo is a JSON number (never a string)', () => {
    const invalid = {
      periodo: '2026-07',
      totalTransacciones: 1,
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
          bucket: 'Necesidades',
          categoria: null,
        },
      ],
    };

    expect(() => movimientosResponseSchema.parse(invalid)).toThrow();
  });
});
