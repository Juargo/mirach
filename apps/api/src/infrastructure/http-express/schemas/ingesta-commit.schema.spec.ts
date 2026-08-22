import { Bucket } from '../../../domain/value-objects/bucket';
import { aCommitIngestaResponseDto } from '../../http/dto/commit-ingesta.dto';
import type { CommitIngestaResult } from '../../../application/use-cases/commit-ingesta.use-case';
import {
  commitIngestaRequestSchema,
  commitIngestaResponseSchema,
} from './ingesta-commit.schema';

/**
 * `commitIngestaRequestSchema` / `commitIngestaResponseSchema` — Phase PR5
 * of US-057: OpenAPI contract for POST /api/ingestas/commit.
 *
 * REQUEST: multipart/form-data with a `file` field + an `edits` JSON text
 * field (≤256 KB, optional; absent/empty ⇒ empty overlay).
 *
 * RESPONSE: mirrors `CommitIngestaResponseDto` with `bucket` + `categoriaId`
 * per row. The `aCommitIngestaResponseDto()` mapper is the sync guarantee
 * this schema is checked against.
 */
describe('commitIngestaRequestSchema', () => {
  it('accepts a payload with a file field and no edits field', () => {
    const result = commitIngestaRequestSchema.safeParse({
      file: new File(['contenido'], 'cartola.xlsx'),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with both file and edits fields', () => {
    const result = commitIngestaRequestSchema.safeParse({
      file: new File(['contenido'], 'cartola.xlsx'),
      edits: '[{"rowIndex":0,"categoriaId":"cat-123"}]',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sync-guarantee tests — real mapper output must parse against the schema
// ---------------------------------------------------------------------------

function unResultadoCommit(
  transacciones: CommitIngestaResult['transacciones'],
): CommitIngestaResult {
  return {
    ingestaId: 'ingesta-abc',
    totalTransacciones: transacciones.length,
    duplicadosOmitidos: 0,
    transacciones,
  };
}

function unaTransaccionResult(
  cargo: bigint,
  abono: bigint,
  bucket: Bucket,
  categoriaId: string | null,
): CommitIngestaResult['transacciones'][number] {
  return {
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Compra supermercado',
    cargo,
    abono,
    bucket,
    categoriaId,
  };
}

describe('commitIngestaResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty transacciones array', () => {
    const dto = aCommitIngestaResponseDto(unResultadoCommit([]));

    const parsed = commitIngestaResponseSchema.parse(dto);
    expect(parsed.transacciones).toEqual([]);
    expect(parsed.totalTransacciones).toBe(0);
    expect(parsed.duplicadosOmitidos).toBe(0);
  });

  it('parses the real DTO output for a Necesidades row with a categoriaId', () => {
    const tx = unaTransaccionResult(
      50_000n,
      0n,
      Bucket.Necesidades,
      'cat-necesidades',
    );
    const dto = aCommitIngestaResponseDto(unResultadoCommit([tx]));

    const parsed = commitIngestaResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.bucket).toBe('Necesidades');
    expect(parsed.transacciones[0]?.categoriaId).toBe('cat-necesidades');
    expect(parsed.transacciones[0]?.cargo).toBe('50000');
    expect(parsed.transacciones[0]?.abono).toBe('0');
  });

  it('parses the real DTO output for an Ingreso row (categoriaId null)', () => {
    const tx = unaTransaccionResult(0n, 1_000_000n, Bucket.Ingreso, null);
    const dto = aCommitIngestaResponseDto(unResultadoCommit([tx]));

    const parsed = commitIngestaResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.bucket).toBe('Ingreso');
    expect(parsed.transacciones[0]?.categoriaId).toBeNull();
    expect(parsed.transacciones[0]?.abono).toBe('1000000');
  });

  it('parses the real DTO output with a BigInt amount beyond MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n;
    const tx = unaTransaccionResult(0n, big, Bucket.Ingreso, null);
    const dto = aCommitIngestaResponseDto(unResultadoCommit([tx]));

    const parsed = commitIngestaResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.abono).toBe('9007199254740993');
  });

  it('rejects a payload where cargo is a JSON number (must be string)', () => {
    const invalid = {
      ingestaId: 'ingesta-abc',
      totalTransacciones: 1,
      duplicadosOmitidos: 0,
      transacciones: [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Compra',
          cargo: 50000, // must be string, not number
          abono: '0',
          bucket: 'Necesidades',
          categoriaId: 'cat-x',
        },
      ],
    };

    expect(() => commitIngestaResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects a payload missing the bucket field', () => {
    const invalid = {
      ingestaId: 'ingesta-abc',
      totalTransacciones: 1,
      duplicadosOmitidos: 0,
      transacciones: [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Compra',
          cargo: '50000',
          abono: '0',
          // bucket missing
          categoriaId: 'cat-x',
        },
      ],
    };

    expect(() => commitIngestaResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects stray keys via .strict() on the response envelope', () => {
    const invalid = {
      ingestaId: 'ingesta-abc',
      totalTransacciones: 0,
      duplicadosOmitidos: 0,
      transacciones: [],
      unexpectedKey: 'should fail',
    };

    expect(() => commitIngestaResponseSchema.parse(invalid)).toThrow();
  });
});
