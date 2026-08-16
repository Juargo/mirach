import { Bucket } from '../../../domain/value-objects/bucket';
import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { aResumenMesDto } from '../../http/dto/resumen-mes.dto';
import { resumenQuerySchema, resumenResponseSchema } from './resumen.schema';

/**
 * `resumenQuerySchema` / `resumenResponseSchema` — Slice 1 of the
 * openapi-contract-express change (GET /api/resumen).
 *
 * LAYER-HONESTY GATE (design-flagged): the query schema validates TRANSPORT
 * SHAPE ONLY. It must NOT encode the YYYY-MM format rule — that stays a
 * DOMAIN rule (PeriodoMes VO / PeriodoInvalidoError, ADR-005 + DRY). A
 * malformed-but-string `periodo` (e.g. "garbage") MUST still pass this
 * schema and reach the existing domain-level scrubbed 400.
 */
describe('resumenQuerySchema', () => {
  it('accepts a request with no periodo at all', () => {
    const result = resumenQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts periodo as a well-formed string', () => {
    const result = resumenQuerySchema.safeParse({ periodo: '2026-07' });
    expect(result.success).toBe(true);
  });

  it('does NOT reject a malformed-but-string periodo (domain owns YYYY-MM)', () => {
    const result = resumenQuerySchema.safeParse({ periodo: 'garbage' });
    expect(result.success).toBe(true);
  });

  it('rejects periodo as an array (Express repeated-query shape)', () => {
    const result = resumenQuerySchema.safeParse({
      periodo: ['2026-07', '2026-08'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects periodo as an object', () => {
    const result = resumenQuerySchema.safeParse({ periodo: { foo: 'bar' } });
    expect(result.success).toBe(false);
  });
});

function makeResumen(opts: {
  totalIngreso: bigint;
  necesidades?: bigint;
  deseos?: bigint;
  ahorro?: bigint;
  sinCategoria?: bigint;
}): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: opts.totalIngreso,
    necesidades: opts.necesidades ?? 0n,
    deseos: opts.deseos ?? 0n,
    ahorro: opts.ahorro ?? 0n,
    sinCategoria: opts.sinCategoria ?? 0n,
    cantidadSinCategoria: 0,
  });
}

/**
 * The sync guarantee (openapi-contract-express design, spec req #8): this
 * schema is validated against the REAL `aResumenMesDto()` mapper output, not
 * a hand-built fixture that could silently drift from the wire contract.
 */
describe('resumenResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for the happy path (income > 0)', () => {
    const resumen = makeResumen({
      totalIngreso: 1_500_000n,
      necesidades: 500_000n,
      deseos: 200_000n,
      ahorro: 300_000n,
    });
    const dto = aResumenMesDto('2026-07', resumen);

    expect(() => resumenResponseSchema.parse(dto)).not.toThrow();
  });

  it('parses the real DTO output for the sinIngreso path (all-null bp/estado)', () => {
    const resumen = makeResumen({ totalIngreso: 0n, necesidades: 100_000n });
    const dto = aResumenMesDto('2026-07', resumen);

    expect(() => resumenResponseSchema.parse(dto)).not.toThrow();
  });

  it('parses the real DTO output for a BigInt beyond MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n;
    const resumen = makeResumen({ totalIngreso: big, necesidades: big });
    const dto = aResumenMesDto('2026-07', resumen);

    const parsed = resumenResponseSchema.parse(dto);
    expect(parsed.totalIngreso).toBe('9007199254740993');
  });

  it('accepts every bucket name emitted by the mapper', () => {
    const resumen = makeResumen({ totalIngreso: 1_000_000n });
    const dto = aResumenMesDto('2026-07', resumen);

    const parsed = resumenResponseSchema.parse(dto);
    const bucketNames = parsed.buckets.map((b) => b.bucket);
    expect(bucketNames).toContain(Bucket.Necesidades);
    expect(bucketNames).toContain(Bucket.Deseos);
    expect(bucketNames).toContain(Bucket.Ahorro);
    expect(bucketNames).toContain(Bucket.SinCategoria);
  });

  it('rejects a payload where a money field is a JSON number (never a string)', () => {
    const invalid = {
      periodo: '2026-07',
      totalIngreso: 100000, // must be string, not number
      sinIngreso: false,
      buckets: [],
      targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
      estadoGlobal: null,
    };

    expect(() => resumenResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects a payload with an uppercase (domain-style) estadoGlobal value', () => {
    const invalid = {
      periodo: '2026-07',
      totalIngreso: '0',
      sinIngreso: true,
      buckets: [],
      targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
      estadoGlobal: 'Verde', // wire enum is lowercase 'verde'
    };

    expect(() => resumenResponseSchema.parse(invalid)).toThrow();
  });
});
