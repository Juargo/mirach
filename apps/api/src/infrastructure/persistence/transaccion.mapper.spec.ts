import { aPersistencia, aDominio } from './transaccion.mapper';
import { NoOpCryptoService } from './no-op-crypto.service';
import { Transaccion } from '../../domain/value-objects/transaccion';

const crypto = new NoOpCryptoService();

describe('transaccion.mapper', () => {
  describe('aPersistencia', () => {
    it('convierte cargo/abono numéricos a BigInt y deja bucketId nulo', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: 'Compra',
        cargo: 8103,
        abono: 0,
      };

      const row = aPersistencia(tx, crypto);

      expect(row.cargo).toBe(8103n);
      expect(row.abono).toBe(0n);
      expect(typeof row.cargo).toBe('bigint');
      expect(typeof row.abono).toBe('bigint');
      expect(row.bucketId).toBeNull();
      expect(row.fecha).toEqual(tx.fecha);
    });

    it('cifra la descripción usando el crypto service', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-05-15T00:00:00.000Z'),
        descripcion: 'Sueldo',
        cargo: 0,
        abono: 1500000,
      };

      const row = aPersistencia(tx, crypto);

      expect(row.descripcion).toBe('Sueldo');
      expect(row.abono).toBe(1500000n);
      expect(row.cargo).toBe(0n);
    });
  });

  describe('round-trip integrity', () => {
    it('preserva cargo positivo/abono cero sin pérdida (< 2^53)', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: 'Retiro cajero',
        cargo: 1234567,
        abono: 0,
      };

      const roundTripped = aDominio(aPersistencia(tx, crypto), crypto);

      expect(roundTripped).toEqual(tx);
      expect(roundTripped.cargo).toBe(1234567);
      expect(roundTripped.abono).toBe(0);
    });

    it('preserva abono positivo/cargo cero sin pérdida (< 2^53)', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-06-01T00:00:00.000Z'),
        descripcion: 'Transferencia',
        cargo: 0,
        abono: 999999999,
      };

      const roundTripped = aDominio(aPersistencia(tx, crypto), crypto);

      expect(roundTripped).toEqual(tx);
      expect(typeof roundTripped.cargo).toBe('number');
      expect(typeof roundTripped.abono).toBe('number');
    });
  });

  describe('aDominio', () => {
    it('convierte BigInt de vuelta a número y descifra la descripción', () => {
      const row = {
        fecha: new Date('2026-07-01T00:00:00.000Z'),
        descripcion: 'Pago',
        cargo: 50000n,
        abono: 0n,
        bucketId: null,
      };

      const tx = aDominio(row, crypto);

      expect(tx.cargo).toBe(50000);
      expect(tx.abono).toBe(0);
      expect(tx.descripcion).toBe('Pago');
      expect(tx.fecha).toEqual(row.fecha);
    });
  });

  describe('sign/zero contract', () => {
    it('preserva cargo y abono en cero (fila neutra)', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-08-01T00:00:00.000Z'),
        descripcion: 'Ajuste',
        cargo: 0,
        abono: 0,
      };

      const row = aPersistencia(tx, crypto);
      expect(row.cargo).toBe(0n);
      expect(row.abono).toBe(0n);

      const roundTripped = aDominio(row, crypto);
      expect(roundTripped.cargo).toBe(0);
      expect(roundTripped.abono).toBe(0);
    });
  });

  describe('BigInt→number read-path overflow guard', () => {
    it('round-trip exacto en Number.MAX_SAFE_INTEGER no pierde precisión', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-09-01T00:00:00.000Z'),
        descripcion: 'Monto máximo seguro',
        cargo: Number.MAX_SAFE_INTEGER,
        abono: 0,
      };

      const roundTripped = aDominio(aPersistencia(tx, crypto), crypto);

      expect(roundTripped.cargo).toBe(Number.MAX_SAFE_INTEGER);
      expect(roundTripped).toEqual(tx);
    });

    it('lanza un error claro cuando cargo excede Number.MAX_SAFE_INTEGER (no trunca silenciosamente)', () => {
      const row = {
        fecha: new Date('2026-09-02T00:00:00.000Z'),
        descripcion: 'Overflow',
        cargo: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        abono: 0n,
        bucketId: null,
      };

      expect(() => aDominio(row, crypto)).toThrow(RangeError);
      expect(() => aDominio(row, crypto)).toThrow(/cargo/);
      expect(() => aDominio(row, crypto)).toThrow(/MAX_SAFE_INTEGER/);
    });

    it('lanza un error claro cuando abono excede Number.MAX_SAFE_INTEGER', () => {
      const row = {
        fecha: new Date('2026-09-03T00:00:00.000Z'),
        descripcion: 'Overflow abono',
        cargo: 0n,
        abono: BigInt(Number.MAX_SAFE_INTEGER) + 10n,
        bucketId: null,
      };

      expect(() => aDominio(row, crypto)).toThrow(RangeError);
      expect(() => aDominio(row, crypto)).toThrow(/abono/);
    });
  });

  describe('aPersistencia integer precondition', () => {
    it('lanza un error claro para cargo no entero (no usa Math.trunc silencioso)', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-10-01T00:00:00.000Z'),
        descripcion: 'Float',
        cargo: 1234.56,
        abono: 0,
      };

      expect(() => aPersistencia(tx, crypto)).toThrow(TypeError);
      expect(() => aPersistencia(tx, crypto)).toThrow(/cargo/);
      expect(() => aPersistencia(tx, crypto)).toThrow(/entero/);
    });

    it('lanza un error claro para abono NaN', () => {
      const tx: Transaccion = {
        fecha: new Date('2026-10-02T00:00:00.000Z'),
        descripcion: 'NaN',
        cargo: 0,
        abono: Number.NaN,
      };

      expect(() => aPersistencia(tx, crypto)).toThrow(TypeError);
      expect(() => aPersistencia(tx, crypto)).toThrow(/abono/);
    });
  });
});
