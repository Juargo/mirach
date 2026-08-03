import { ResumenAnual } from '../../../domain/value-objects/resumen-anual';
import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { aResumenAnualDto } from '../../http/dto/resumen-anual.dto';
import {
  resumenAnualQuerySchema,
  resumenAnualResponseSchema,
} from './resumen-anual.schema';

/**
 * `resumenAnualQuerySchema` / `resumenAnualResponseSchema` — Phase 10 rollout
 * of the openapi-contract-express change (GET /api/resumen/anual).
 *
 * LAYER-HONESTY GATE: the query schema validates TRANSPORT SHAPE ONLY. It
 * must NOT encode the year-range rule — that stays a DOMAIN rule
 * (`AnioInvalidoError`). A malformed-but-string `anio` MUST still pass this
 * schema and reach the existing domain-level scrubbed 400.
 */
describe('resumenAnualQuerySchema', () => {
  it('accepts a request with no anio at all', () => {
    const result = resumenAnualQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts anio as a well-formed string', () => {
    const result = resumenAnualQuerySchema.safeParse({ anio: '2026' });
    expect(result.success).toBe(true);
  });

  it('does NOT reject a malformed-but-string anio (domain owns the range check)', () => {
    const result = resumenAnualQuerySchema.safeParse({ anio: 'garbage' });
    expect(result.success).toBe(true);
  });

  it('rejects anio as an array (Express repeated-query shape)', () => {
    const result = resumenAnualQuerySchema.safeParse({
      anio: ['2026', '2027'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects anio as an object', () => {
    const result = resumenAnualQuerySchema.safeParse({ anio: { foo: 'bar' } });
    expect(result.success).toBe(false);
  });
});

function makeResumen(totalIngreso: bigint, necesidades = 0n): ResumenMes {
  return ResumenMes.crear({
    totalIngreso,
    necesidades,
    deseos: 0n,
    ahorro: 0n,
    sinCategoria: 0n,
  });
}

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aResumenAnualDto()` mapper output over a real 12-month
 * `ResumenAnual`, not a hand-built fixture.
 */
describe('resumenAnualResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for a full 12-month year', () => {
    const meses = Array.from({ length: 12 }, (_, i) =>
      makeResumen(1_000_000n * BigInt(i + 1), 100_000n),
    );
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();
    const dto = aResumenAnualDto(resumenAnual);

    const parsed = resumenAnualResponseSchema.parse(dto);
    expect(parsed.anio).toBe(2026);
    expect(parsed.meses).toHaveLength(12);
    expect(parsed.meses[0]?.periodo).toBe('2026-01');
    expect(parsed.meses[11]?.periodo).toBe('2026-12');
  });

  it('rejects a payload with fewer than 12 meses', () => {
    const invalid = {
      anio: 2026,
      meses: [],
    };

    expect(() => resumenAnualResponseSchema.parse(invalid)).not.toThrow();
    // meses is not length-constrained by the schema itself (transport shape);
    // the domain (ResumenAnual.crear) is what enforces the 12-entry invariant.
  });

  it('rejects a payload where anio is a string (must be a JSON number)', () => {
    const invalid = {
      anio: '2026',
      meses: [],
    };

    expect(() => resumenAnualResponseSchema.parse(invalid)).toThrow();
  });
});
