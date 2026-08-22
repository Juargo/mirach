import { describe, it, expect } from 'vitest';
import { MovimientoManual } from '../../../domain/value-objects/movimiento-manual';
import { aRegistrarMovimientoManualResponseDto } from './movimiento-manual.dto';

// ---------------------------------------------------------------------------
// Helpers — build a MovimientoManual synchronously for mapper tests.
// ---------------------------------------------------------------------------

function makeIngreso(monto = '45000'): MovimientoManual {
  const result = MovimientoManual.crear({
    tipo: 'Ingreso',
    fecha: new Date('2026-08-10'),
    descripcion: 'Reembolso caja chica',
    monto,
    clock: () => new Date('2026-08-10'),
  });
  if (result.isFail()) throw new Error('unexpected VO failure in test fixture');
  return result.getValue();
}

function makeGasto(monto = '12990'): MovimientoManual {
  const result = MovimientoManual.crear({
    tipo: 'Gasto',
    fecha: new Date('2026-08-10'),
    descripcion: 'Feria',
    monto,
    clock: () => new Date('2026-08-10'),
  });
  if (result.isFail()) throw new Error('unexpected VO failure in test fixture');
  return result.getValue();
}

// ---------------------------------------------------------------------------
// T-14 — DTO mapper tests (RED first, implementation comes after)
// ---------------------------------------------------------------------------

describe('aRegistrarMovimientoManualResponseDto', () => {
  describe('Ingreso variant', () => {
    it('maps cargo to "0" and abono to the monto string', () => {
      const vo = makeIngreso('45000');
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-1');

      expect(dto.cargo).toBe('0');
      expect(dto.abono).toBe('45000');
    });

    it('sets categoriaId to null', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-2');

      expect(dto.categoriaId).toBeNull();
    });

    it('sets origen to "Manual"', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-3');

      expect(dto.origen).toBe('Manual');
    });

    it('carries the supplied id', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'abc-123');

      expect(dto.id).toBe('abc-123');
    });

    it('serializes fecha as an ISO-8601 string', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-4');

      // Must be a valid ISO string parseable back to a date
      expect(() => new Date(dto.fecha)).not.toThrow();
      expect(new Date(dto.fecha).getUTCFullYear()).toBe(2026);
    });

    it('carries the plaintext descripcion from the VO', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-5');

      expect(dto.descripcion).toBe('Reembolso caja chica');
    });

    it('sets bucket to "Ingreso" (the Bucket enum wire value)', () => {
      const vo = makeIngreso();
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-ingreso-6');

      expect(dto.bucket).toBe('Ingreso');
    });
  });

  describe('Gasto variant', () => {
    it('maps cargo to the monto string and abono to "0"', () => {
      const vo = makeGasto('12990');
      const dto = aRegistrarMovimientoManualResponseDto(
        vo,
        'id-gasto-1',
        'cat-deseos-1',
        'Deseos',
      );

      expect(dto.cargo).toBe('12990');
      expect(dto.abono).toBe('0');
    });

    it('carries the provided categoriaId', () => {
      const vo = makeGasto();
      const dto = aRegistrarMovimientoManualResponseDto(
        vo,
        'id-gasto-2',
        'cat-necesidades-1',
        'Necesidades',
      );

      expect(dto.categoriaId).toBe('cat-necesidades-1');
    });

    it('carries the provided bucket string', () => {
      const vo = makeGasto();
      const dto = aRegistrarMovimientoManualResponseDto(
        vo,
        'id-gasto-3',
        'cat-ahorro-1',
        'Ahorro',
      );

      expect(dto.bucket).toBe('Ahorro');
    });

    it('sets origen to "Manual"', () => {
      const vo = makeGasto();
      const dto = aRegistrarMovimientoManualResponseDto(
        vo,
        'id-gasto-4',
        'cat-deseos-2',
        'Deseos',
      );

      expect(dto.origen).toBe('Manual');
    });
  });

  describe('Gasto variant — runtime guard for missing bucket', () => {
    it('throws when called on a Gasto VO without supplying a bucket', () => {
      const vo = makeGasto();
      // Calling without bucket on a Gasto VO is a programmer error — the guard
      // must throw rather than silently yielding bucket:"" (fix for dangerous default).
      expect(() =>
        aRegistrarMovimientoManualResponseDto(vo, 'id-guard-1', 'cat-1'),
      ).toThrow('bucket is required for Gasto rows');
    });

    it('throws when called on a Gasto VO with an empty bucket string', () => {
      const vo = makeGasto();
      expect(() =>
        aRegistrarMovimientoManualResponseDto(vo, 'id-guard-2', 'cat-1', ''),
      ).toThrow('bucket is required for Gasto rows');
    });
  });

  describe('BigInt-safe serialization', () => {
    it('serializes BigInt monto as a plain string without loss', () => {
      // Number.MAX_SAFE_INTEGER as a monto — must survive as exact string
      const maxSafe = String(Number.MAX_SAFE_INTEGER);
      const vo = makeIngreso(maxSafe);
      const dto = aRegistrarMovimientoManualResponseDto(vo, 'id-overflow-1');

      // abono should equal the original string (no float truncation)
      expect(dto.abono).toBe(maxSafe);
      expect(dto.cargo).toBe('0');
    });
  });
});
