import { describe, it, expect } from 'vitest';
import { parseEdits, aCommitIngestaResponseDto } from './commit-ingesta.dto';
import { EdicionesInvalidasError } from '../../../domain/errors/ediciones-invalidas.error';
import { Bucket } from '../../../domain/value-objects/bucket';
import type { CommitIngestaResult } from '../../../application/use-cases/commit-ingesta.use-case';
// Regression guard: one-shot DTOs untouched (D-13)
import {
  aIngestaResponseDto,
  TransaccionResponseDto,
} from './ingesta-response.dto';

// ---------------------------------------------------------------------------
// parseEdits — infra boundary parser (D-02/D-03)
// ---------------------------------------------------------------------------

describe('parseEdits', () => {
  it('absent/undefined → empty array []', () => {
    const result = parseEdits(undefined);
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('empty string → empty array []', () => {
    const result = parseEdits('');
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('valid JSON array with categoriaId string → typed edits', () => {
    const raw = JSON.stringify([
      { rowIndex: 0, categoriaId: 'cat-abc' },
      { rowIndex: 2, categoriaId: 'cat-xyz' },
    ]);
    const result = parseEdits(raw);
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([
      { rowIndex: 0, categoriaId: 'cat-abc' },
      { rowIndex: 2, categoriaId: 'cat-xyz' },
    ]);
  });

  it('valid JSON array with categoriaId null → typed edits (DES-CLASIFICAR)', () => {
    const raw = JSON.stringify([{ rowIndex: 1, categoriaId: null }]);
    const result = parseEdits(raw);
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([{ rowIndex: 1, categoriaId: null }]);
  });

  it('malformed JSON → EdicionesInvalidasError, message never echoes raw field', () => {
    const raw = '{ not valid json';
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(EdicionesInvalidasError);
    // Must NOT echo the raw value in the message
    expect(error.message).not.toContain(raw);
    expect(error.message).toContain('JSON');
  });

  it('non-array JSON → EdicionesInvalidasError', () => {
    const result = parseEdits('{"rowIndex":0,"categoriaId":"x"}');
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('array element missing rowIndex → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ categoriaId: 'x' }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
    expect(result.getError().message).not.toContain(raw);
  });

  it('array element missing categoriaId → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ rowIndex: 0 }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('rowIndex is a non-integer string → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ rowIndex: 'abc', categoriaId: null }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('rowIndex is a float (non-integer) → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ rowIndex: 1.5, categoriaId: null }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('rowIndex is negative → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ rowIndex: -1, categoriaId: null }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('categoriaId is a number (wrong type) → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([{ rowIndex: 0, categoriaId: 123 }]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });

  it('null as non-null-but-not-object element in array → EdicionesInvalidasError', () => {
    const raw = JSON.stringify([null]);
    const result = parseEdits(raw);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EdicionesInvalidasError);
  });
});

// ---------------------------------------------------------------------------
// aCommitIngestaResponseDto — D-13 mapper (independent, NOT aIngestaResponseDto)
// ---------------------------------------------------------------------------

const BASE_DATE = new Date('2024-01-15T00:00:00.000Z');

function makeResult(
  overrides: Partial<CommitIngestaResult> = {},
): CommitIngestaResult {
  return {
    ingestaId: 'ingesta-123',
    totalTransacciones: 2,
    duplicadosOmitidos: 1,
    transacciones: [
      {
        fecha: BASE_DATE,
        descripcion: 'SUPERMERCADO',
        cargo: 50000n,
        abono: 0n,
        bucket: Bucket.Necesidades,
        categoriaId: 'cat-necesidades',
      },
      {
        fecha: BASE_DATE,
        descripcion: 'SUELDO',
        cargo: 0n,
        abono: 1500000n,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      },
    ],
    ...overrides,
  };
}

describe('aCommitIngestaResponseDto', () => {
  it('maps ingestaId, totalTransacciones, duplicadosOmitidos', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.ingestaId).toBe('ingesta-123');
    expect(dto.totalTransacciones).toBe(2);
    expect(dto.duplicadosOmitidos).toBe(1);
  });

  it('maps cargo/abono as BigInt-safe strings', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.transacciones[0].cargo).toBe('50000');
    expect(dto.transacciones[0].abono).toBe('0');
    expect(dto.transacciones[1].cargo).toBe('0');
    expect(dto.transacciones[1].abono).toBe('1500000');
  });

  it('maps bucket as string (enum value)', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.transacciones[0].bucket).toBe('Necesidades');
    expect(dto.transacciones[1].bucket).toBe('Ingreso');
  });

  it('maps categoriaId (string or null)', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.transacciones[0].categoriaId).toBe('cat-necesidades');
    expect(dto.transacciones[1].categoriaId).toBeNull();
  });

  it('maps fecha as ISO-8601 string', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.transacciones[0].fecha).toBe(BASE_DATE.toISOString());
  });

  it('maps descripcion verbatim', () => {
    const dto = aCommitIngestaResponseDto(makeResult());
    expect(dto.transacciones[0].descripcion).toBe('SUPERMERCADO');
  });

  it('maps all bucket enum values correctly', () => {
    const bucketValues: Array<[Bucket, string]> = [
      [Bucket.Necesidades, 'Necesidades'],
      [Bucket.Deseos, 'Deseos'],
      [Bucket.Ahorro, 'Ahorro'],
      [Bucket.Ingreso, 'Ingreso'],
      [Bucket.SinCategoria, 'SinCategoria'],
    ];

    for (const [bucket, expected] of bucketValues) {
      const result = makeResult({
        transacciones: [
          {
            fecha: BASE_DATE,
            descripcion: 'TX',
            cargo: 0n,
            abono: 0n,
            bucket,
            categoriaId: null,
          },
        ],
      });
      const dto = aCommitIngestaResponseDto(result);
      expect(dto.transacciones[0].bucket).toBe(expected);
    }
  });

  it('null bucket is an invariant break — throws at the infra boundary (design §5.2/D-11)', () => {
    // Commit resolves classification pre-persist; a null bucket in the result
    // means the application layer broke the invariant. The mapper must fail loud
    // (route try/catch → 500) rather than emit a malformed contract.
    const result = makeResult({
      transacciones: [
        {
          fecha: BASE_DATE,
          descripcion: 'TX',
          cargo: 1000n,
          abono: 0n,
          bucket: null,
          categoriaId: null,
        },
      ],
    });
    expect(() => aCommitIngestaResponseDto(result)).toThrow(/bucket null/);
  });

  it('returns empty transacciones array when result has none', () => {
    const dto = aCommitIngestaResponseDto(
      makeResult({ transacciones: [], totalTransacciones: 0 }),
    );
    expect(dto.transacciones).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Regression guard: one-shot DTOs untouched (D-13)
// ---------------------------------------------------------------------------

describe('one-shot DTO regression guard (D-13)', () => {
  it('aIngestaResponseDto and TransaccionResponseDto are still importable and unchanged', () => {
    // TransaccionResponseDto has only: fecha, descripcion, cargo, abono — NO bucket/categoriaId
    const dto: TransaccionResponseDto = {
      fecha: BASE_DATE.toISOString(),
      descripcion: 'TX',
      cargo: '1000',
      abono: '0',
    };
    // @ts-expect-error — bucket does not exist on one-shot TransaccionResponseDto
    const _: undefined = dto.bucket;
    void _;

    // aIngestaResponseDto should still map correctly (smoke test)
    // We can't call it without a real ProcessIngestaResult, so just verify it's importable
    expect(typeof aIngestaResponseDto).toBe('function');
  });
});
