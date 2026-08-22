import { describe, it, expect } from 'vitest';
import { registrarMovimientoManualSchema } from './movimiento-manual.schema';

// ---------------------------------------------------------------------------
// T-15 — Zod discriminated union schema tests (RED first, impl comes after)
//
// Coverage per tasks.md T-15:
//   - Ingreso with stray `bucket`/`categoriaId` ⇒ .strict() 400 (safeParse fails)
//   - Gasto missing `bucket` ⇒ 400
//   - `monto` as JSON number ⇒ 400
//   - valid Ingreso parses
//   - valid Gasto parses
// ---------------------------------------------------------------------------

describe('registrarMovimientoManualSchema', () => {
  describe('valid Ingreso', () => {
    it('parses a well-formed Ingreso body', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Reembolso caja chica',
        monto: '45000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tipo).toBe('Ingreso');
        expect(result.data.monto).toBe('45000');
        expect(result.data.fecha).toBe('2026-08-10');
      }
    });
  });

  describe('valid Gasto', () => {
    it('parses a well-formed Gasto body with bucket and categoriaId', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'Deseos',
        categoriaId: 'cat-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tipo).toBe('Gasto');
        expect(result.data.monto).toBe('12990');
        if (result.data.tipo === 'Gasto') {
          expect(result.data.bucket).toBe('Deseos');
          expect(result.data.categoriaId).toBe('cat-123');
        }
      }
    });

    it('accepts Necesidades as a valid bucket', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Supermercado',
        monto: '35000',
        bucket: 'Necesidades',
        categoriaId: 'cat-456',
      });
      expect(result.success).toBe(true);
    });

    it('accepts Ahorro as a valid bucket', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Depósito AFP',
        monto: '50000',
        bucket: 'Ahorro',
        categoriaId: 'cat-789',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Ingreso strict mode — rejects stray Gasto-only fields', () => {
    it('rejects an Ingreso body that contains a stray bucket field', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Sueldo',
        monto: '1000000',
        bucket: 'Deseos', // stray — not allowed on Ingreso
      });

      expect(result.success).toBe(false);
    });

    it('rejects an Ingreso body that contains a stray categoriaId field', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Sueldo',
        monto: '1000000',
        categoriaId: 'cat-123', // stray — not allowed on Ingreso
      });

      expect(result.success).toBe(false);
    });

    it('rejects an Ingreso body that contains both stray bucket and categoriaId', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Sueldo',
        monto: '1000000',
        bucket: 'Ahorro',
        categoriaId: 'cat-abc',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Gasto — missing required fields', () => {
    it('rejects a Gasto body missing bucket', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        categoriaId: 'cat-123',
        // bucket is absent
      });

      expect(result.success).toBe(false);
    });

    it('rejects a Gasto body missing categoriaId', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'Deseos',
        // categoriaId is absent
      });

      expect(result.success).toBe(false);
    });

    it('rejects a Gasto body with an invalid bucket value', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'Ingreso', // not a valid Gasto bucket
        categoriaId: 'cat-123',
      });

      expect(result.success).toBe(false);
    });

    it('rejects a Gasto body with SinCategoria as bucket', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'SinCategoria', // not a valid Gasto bucket
        categoriaId: 'cat-123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('monto field — BigInt-safe strings only', () => {
    it('rejects monto as a JSON number (not a string)', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Reembolso',
        monto: 45000, // JSON number — must be rejected
      });

      expect(result.success).toBe(false);
    });

    it('accepts monto as a numeric string', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Reembolso',
        monto: '45000',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('fecha field — shape-only YYYY-MM-DD', () => {
    it('rejects a fecha that does not match YYYY-MM-DD', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '10/08/2026', // wrong format
        descripcion: 'Test',
        monto: '1000',
      });

      expect(result.success).toBe(false);
    });

    it('accepts a well-formed YYYY-MM-DD fecha', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Ingreso',
        fecha: '2026-08-10',
        descripcion: 'Test',
        monto: '1000',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('tipo field', () => {
    it('rejects an unknown tipo value', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Transferencia',
        fecha: '2026-08-10',
        descripcion: 'Test',
        monto: '1000',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('categoriaId field — shape constraint min(1)', () => {
    it('rejects a Gasto body with an empty categoriaId string', () => {
      const result = registrarMovimientoManualSchema.safeParse({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'Deseos',
        categoriaId: '', // empty string is not a valid id at the transport layer
      });

      expect(result.success).toBe(false);
    });
  });
});
